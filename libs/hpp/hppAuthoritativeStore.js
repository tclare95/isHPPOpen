// MongoDB store for the authoritative HPP writer (#89). Inactive by default.
//
// State lives in `hppStatusState` (separate from the shadow state, so shadow
// evidence is never mixed with authoritative history). Transitions are
// openIndicator records written with `_id = ${ruleId}#${sequence}`, so a
// retried, overlapping or repeated insert collides on the default `_id`
// index instead of appending a duplicate. Each record keeps the reader
// contract `{ timestamp: Date, value: boolean }`, with timestamp = observation
// time, plus additive provenance fields.
//
// The store never seeds state on its own: only an operator handover
// (applyHandover) creates or reseeds it from a reconciled openIndicator record.

import { toOpenIndicatorRecord } from "./hppDecision.js";
import { HPP_STATE_ID, SERVICE_PROVENANCE } from "./hppHistory.js";
import { LEGACY_COLLECTION } from "./hppShadowStore.js";
import { WRITER_CONTROL_COLLECTION, WRITER_CONTROL_ID } from "./hppWriterControl.js";

export const AUTHORITATIVE_STATE_COLLECTION = "hppStatusState";

const isDuplicateKey = (error) => error?.code === 11000;
const iso = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const VALID_RECORD = { timestamp: { $exists: true }, value: { $in: [true, false] } };

/** openIndicator record → the transition view the evaluation run adopts. */
const toTransitionView = (record) => record && {
  _id: record._id,
  sequence: record.sequence,
  ruleId: record.ruleId,
  open: record.value,
  observedAt: iso(record.observedAt ?? record.timestamp),
  evaluatedAt: iso(record.evaluatedAt),
};

/** The openIndicator record for one service transition document. */
export const toAuthoritativeRecord = (doc) => ({
  _id: doc._id,
  ...toOpenIndicatorRecord(doc),
  sequence: doc.sequence,
  provenance: SERVICE_PROVENANCE,
});

export function createMongoAuthoritativeStore(db, { stateId = HPP_STATE_ID } = {}) {
  const state = db.collection(AUTHORITATIVE_STATE_COLLECTION);
  const openIndicator = db.collection(LEGACY_COLLECTION);
  const control = db.collection(WRITER_CONTROL_COLLECTION);

  return Object.freeze({
    loadState: () => state.findOne({ _id: stateId }),
    // Never seeds: a missing state holds as no_established_state.
    insertState: async () => false,
    latestLegacyRecord: async () => null,
    async compareAndSet(expectedRevision, fields) {
      const result = await state.updateOne(
        { _id: stateId, revision: expectedRevision },
        { $set: { ...fields, revision: expectedRevision + 1 } },
      );
      return result.matchedCount === 1;
    },
    findTransition: async (id) => toTransitionView(await openIndicator.findOne({ _id: id })),
    async insertTransition(doc) {
      try {
        await openIndicator.insertOne(toAuthoritativeRecord(doc));
        return true;
      } catch (error) {
        if (isDuplicateKey(error)) return false;
        throw error;
      }
    },

    loadControl: () => control.findOne({ _id: WRITER_CONTROL_ID }),
    /** The record every openIndicator reader treats as current. */
    latestOpenIndicator: () => openIndicator.findOne(VALID_RECORD, { sort: { timestamp: -1 } }),
    /** Highest sequence the app has ever written for the rule (sparse: a few dozen a year). */
    async maxAppSequence(ruleId) {
      const records = await openIndicator.find({ ruleId, provenance: SERVICE_PROVENANCE }).toArray();
      return records.reduce((max, record) => Math.max(max, Number.isInteger(record.sequence) ? record.sequence : 0), 0);
    },
    listAppRecords: (ruleId) => openIndicator.find({ ruleId, provenance: SERVICE_PROVENANCE }).toArray(),
  });
}

/**
 * Apply a planned handover (hppHandover.js). State first, then control, each
 * by compare-and-set, so a concurrent handover or run makes it fail without
 * a partial switch: a reseeded state whose epoch the control never reached
 * is inert (the writer guard holds on epoch mismatch).
 * Returns `{ applied: true }` or `{ applied: false, conflict }`.
 */
export async function applyHandover(db, plan, { stateId = HPP_STATE_ID } = {}) {
  const control = db.collection(WRITER_CONTROL_COLLECTION);
  const state = db.collection(AUTHORITATIVE_STATE_COLLECTION);

  if (plan.state) {
    const { _id, ...fields } = plan.state;
    if (plan.expected.revision === null) {
      try {
        await state.insertOne({ ...fields, _id: stateId });
      } catch (error) {
        if (isDuplicateKey(error)) return { applied: false, conflict: "state_created_concurrently" };
        throw error;
      }
    } else {
      const result = await state.updateOne({ _id: stateId, revision: plan.expected.revision }, { $set: fields });
      if (result.matchedCount !== 1) return { applied: false, conflict: "state_revision_changed" };
    }
  }

  const { _id, ...fields } = plan.control;
  if (plan.expected.epoch === null) {
    try {
      await control.insertOne({ ...fields, _id: WRITER_CONTROL_ID });
    } catch (error) {
      if (isDuplicateKey(error)) return { applied: false, conflict: "control_created_concurrently" };
      throw error;
    }
  } else {
    const result = await control.updateOne({ _id: WRITER_CONTROL_ID, epoch: plan.expected.epoch }, { $set: fields });
    if (result.matchedCount !== 1) return { applied: false, conflict: "control_epoch_changed" };
  }
  return { applied: true };
}
