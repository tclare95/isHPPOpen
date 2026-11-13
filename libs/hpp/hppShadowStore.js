// MongoDB store for the in-app HPP status service in shadow mode (#89).
//
// Reads legacy `openIndicator` (find/findOne/countDocuments only) and writes
// only the two non-authoritative shadow collections below. This store has no
// openIndicator write; the gated authoritative writer is a separate store
// (hppAuthoritativeStore.js) behind an operator handover.

import { HPP_STATE_ID } from "./hppHistory.js";
import { getHistoryWindowStart } from "./hppWindows.js";

export const LEGACY_COLLECTION = "openIndicator";
export const SHADOW_COLLECTIONS = Object.freeze({
  state: "hppShadowState",
  transitions: "hppShadowTransitions",
});

const isDuplicateKey = (error) => error?.code === 11000;

async function insertOnce(collection, doc) {
  try {
    await collection.insertOne(doc);
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

/**
 * `db` is a connected MongoDB `Db` (or compatible double). Only the default
 * `_id` index is relied on, so no index creation is needed.
 */
export function createMongoShadowStore(db, { stateId = HPP_STATE_ID } = {}) {
  const state = db.collection(SHADOW_COLLECTIONS.state);
  const transitions = db.collection(SHADOW_COLLECTIONS.transitions);
  const legacy = db.collection(LEGACY_COLLECTION);

  return Object.freeze({
    loadState: () => state.findOne({ _id: stateId }),
    insertState: (doc) => insertOnce(state, { ...doc, _id: stateId }),
    async compareAndSet(expectedRevision, fields) {
      const result = await state.updateOne(
        { _id: stateId, revision: expectedRevision },
        { $set: { ...fields, revision: expectedRevision + 1 } },
      );
      return result.matchedCount === 1;
    },
    findTransition: (id) => transitions.findOne({ _id: id }),
    insertTransition: (doc) => insertOnce(transitions, doc),
    // Shadow transitions are sparse (a few dozen a year), so all are read.
    listTransitions: (ruleId) => transitions.find({ ruleId }).toArray(),

    // Legacy reads mirror the public status reader's validity filter.
    latestLegacyRecord: () => legacy.findOne(
      { timestamp: { $exists: true }, value: { $in: [true, false] } },
      { sort: { timestamp: -1 } },
    ),
    /** Count and latest record of openIndicator, for the no-side-effect review. */
    async legacySummary() {
      const [count, latest] = await Promise.all([
        legacy.countDocuments({}),
        legacy.findOne({ timestamp: { $exists: true } }, { sort: { timestamp: -1 } }),
      ]);
      const stamp = latest?.timestamp instanceof Date ? latest.timestamp.toISOString() : latest?.timestamp ?? null;
      return { count, latest: latest ? { id: String(latest._id), timestamp: stamp, value: latest.value ?? null } : null };
    },
    /** The same two bounded reads as /api/hppstatus: window plus carried-in record. */
    async readLegacyHistory(now) {
      const historyStart = getHistoryWindowStart(now);
      const [windowRecords, carriedIn] = await Promise.all([
        legacy.find({ timestamp: { $gte: historyStart } }).toArray(),
        legacy.findOne({ timestamp: { $lt: historyStart }, value: { $in: [true, false] } }, { sort: { timestamp: -1 } }),
      ]);
      return carriedIn ? [carriedIn, ...windowRecords] : windowRecords;
    },
  });
}
