// In-app authoritative HPP writer (#89). Inactive unless HPP_STATUS_SOURCE is
// "authoritative" AND the writer control names the app as owner.
//
// Reuses the shadow evaluation unchanged (decision core, lease, retry
// adoption, `${ruleId}#${sequence}` identity) with the authoritative store
// and a writer guard. The guard holds, writing nothing, unless:
// - the control names the app, the scraper has acknowledged this epoch
//   from a run that started after the switch and wrote nothing, and the
//   legacy fence has passed (hppWriterControl.appWriterStatus);
// - the state was seeded for the control's current epoch; and
// - the newest openIndicator record is one this writer expects (its seed,
//   its last transition, or a pending one). Anything else is another writer.

import { HPP_RULE_V1 } from "./hppDecision.js";
import { createRdpEvidenceReader } from "./hppEvidence.js";
import { transitionId } from "./hppHistory.js";
import { createMongoAuthoritativeStore } from "./hppAuthoritativeStore.js";
import { runHppEvaluation } from "./hppShadowRun.js";
import { WRITER_HOLD_REASONS, appWriterStatus } from "./hppWriterControl.js";

/** Writer guard for the evaluation run; returns a hold reason or null. */
export function createWriterGuard(store, rule = HPP_RULE_V1) {
  return async function guard({ state, now }) {
    const control = await store.loadControl();
    const writer = appWriterStatus(control, now);
    if (!writer.allowed) return writer.reason;
    if (control.epoch !== state.epoch) return WRITER_HOLD_REASONS.EPOCH_MISMATCH;

    const latest = await store.latestOpenIndicator();
    const seedSequence = state.seed?.sequence ?? 0;
    const expected = new Set([
      state.sequence > seedSequence ? transitionId(rule.ruleId, state.sequence) : state.seed?.legacyId,
      transitionId(rule.ruleId, state.sequence + 1),
    ]);
    if (!latest || !expected.has(String(latest._id))) return WRITER_HOLD_REASONS.FOREIGN_WRITE;
    return null;
  };
}

/** `db` is the app's Mongo `Db`; `getClient` is for tests. */
export function createHppAuthoritativeService({ db, getClient, rule = HPP_RULE_V1 }) {
  const store = createMongoAuthoritativeStore(db);
  const readEvidence = createRdpEvidenceReader({ getClient, rule });
  const guard = createWriterGuard(store, rule);

  return Object.freeze({
    store,
    runOnce: ({ now = new Date(), runId } = {}) => runHppEvaluation({ store, readEvidence, guard, now, rule, runId }),

    /** Read-only writer evidence for the admin report and the handover CLI. */
    async writerReport({ now = new Date() } = {}) {
      const [control, state, latest, appRecords] = await Promise.all([
        store.loadControl(),
        store.loadState(),
        store.latestOpenIndicator(),
        store.listAppRecords(rule.ruleId),
      ]);
      const stamp = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
      return {
        control,
        appWriter: appWriterStatus(control, now),
        state: state && { ...state, lease: state.lease ?? null },
        latestOpenIndicator: latest && { id: String(latest._id), timestamp: stamp(latest.timestamp), value: latest.value,
          provenance: latest.provenance ?? null, sequence: latest.sequence ?? null },
        appRecords: appRecords.length,
      };
    },
  });
}
