// RDP Colwick evidence for the in-app HPP status service (#89).
//
// Reads through the web's existing server-side RDP client (Vercel OIDC and
// the per-environment RDP caller role), which already validates measurement
// identity, unit, datum, provider measure, source and page integrity. The
// rule's own `assessEvidence` checks them again before any decision.

import { HPP_RULE_V1 } from "./hppDecision.js";

export const COLWICK_LOOKBACK_MS = 2 * 60 * 60 * 1000;
export const COLWICK_ROW_BUDGET = 64;
export const COLWICK_READ_DEADLINE_MS = 10000;

const failure = (code) => Object.assign(new Error(`HPP Colwick read ${code}`), { code });

async function createDefaultClient() {
  const { createRdpClient } = await import("../rdp/client.js");
  return createRdpClient();
}

function withDeadline(work, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure("TIMEOUT")), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Returns `readEvidence(now)` → `{ pageIntegrity, measurementId, rows }` for one bounded,
 * uncached window. Failures throw an error carrying only a fixed `code`
 * (RdpError codes pass through), which the shadow run records as a hold.
 */
export function createRdpEvidenceReader({
  getClient = createDefaultClient,
  rule = HPP_RULE_V1,
  lookbackMs = COLWICK_LOOKBACK_MS,
  rowBudget = COLWICK_ROW_BUDGET,
  deadlineMs = COLWICK_READ_DEADLINE_MS,
} = {}) {
  let client;
  return async function readEvidence(now) {
    try {
      client ??= await getClient();
      const page = await withDeadline(client.getObservations(rule.measurementId, {
        from: new Date(now.getTime() - lookbackMs).toISOString(),
        to: now.toISOString(),
        limit: rowBudget + 1,
      }), deadlineMs);
      if (!page?.meta || !Array.isArray(page.data)) throw failure("RESPONSE_CONTRACT_ERROR");
      if (page.data.length > rowBudget || page.meta.nextCursor) throw failure("CATCHUP_BUDGET_EXCEEDED");
      // RDP rows omit measurementId; the page's meta carries it (#89 fix).
      return { pageIntegrity: page.meta.pageIntegrity, measurementId: page.meta.measurementId, rows: page.data };
    } catch (error) {
      throw failure(typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR");
    }
  };
}
