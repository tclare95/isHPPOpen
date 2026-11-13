// In-app HPP status service, shadow mode only (#89).
//
// Composes the Mongo shadow store and the RDP evidence reader inside the
// isHPPOpen Vercel app; scheduled by hppShadowCronService.js. Writes only the
// hppShadow* collections.

import { HPP_RULE_V1 } from "./hppDecision.js";
import { createRdpEvidenceReader } from "./hppEvidence.js";
import { buildShadowReport } from "./hppHistory.js";
import { runHppShadowEvaluation } from "./hppShadowRun.js";
import { createMongoShadowStore } from "./hppShadowStore.js";

/** `db` is the app's Mongo `Db` from `connectToDatabase()`; `getClient` is for tests. */
export function createHppShadowService({ db, getClient, rule = HPP_RULE_V1 }) {
  const store = createMongoShadowStore(db);
  const readEvidence = createRdpEvidenceReader({ getClient, rule });

  return Object.freeze({
    /** One scheduled evaluation. */
    runOnce: ({ now = new Date(), runId } = {}) => runHppShadowEvaluation({ store, readEvidence, now, rule, runId }),

    /** Read-only health, continuity and legacy comparison evidence. */
    async report({ now = new Date() } = {}) {
      const [state, transitions, legacyRecords, legacySummary] = await Promise.all([
        store.loadState(),
        store.listTransitions(rule.ruleId),
        store.readLegacyHistory(now),
        store.legacySummary(),
      ]);
      return buildShadowReport({ state, transitions, legacyRecords, legacySummary, now });
    },
  });
}
