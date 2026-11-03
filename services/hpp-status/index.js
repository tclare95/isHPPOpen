// Composition root for the independent HPP status service (#89), shadow mode only.
//
// Not imported by the Next.js app. A future runtime entry point (approved
// separately) supplies a Mongo `Db` for a dedicated least-privilege user and a
// `signedGet` bound to the service's own RDP read role.

import { HPP_RULE_V1 } from "../../libs/hpp/hppDecision.js";
import { buildShadowReport } from "../../libs/hpp/hppHistory.js";
import { runHppShadowEvaluation } from "../../libs/hpp/hppShadowRun.js";
import { createMongoShadowStore } from "./mongoShadowStore.js";
import { createRdpColwickReader } from "./rdpColwickReader.js";

export function createHppShadowService({ db, apiUrl, signedGet, rule = HPP_RULE_V1 }) {
  const store = createMongoShadowStore(db);
  const readEvidence = createRdpColwickReader({ apiUrl, signedGet, rule });

  return Object.freeze({
    /** One scheduled evaluation. */
    runOnce: ({ now = new Date(), runId } = {}) => runHppShadowEvaluation({ store, readEvidence, now, rule, runId }),

    /** Read-only health, continuity and legacy comparison evidence. */
    async report({ now = new Date() } = {}) {
      const [state, transitions, legacyRecords] = await Promise.all([
        store.loadState(),
        store.listTransitions(rule.ruleId),
        store.readLegacyHistory(now),
      ]);
      return buildShadowReport({ state, transitions, legacyRecords, now });
    },
  });
}
