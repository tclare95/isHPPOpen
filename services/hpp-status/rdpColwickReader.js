// RDP Colwick observation reader for the independent HPP status service (#89).
//
// The HPP service signs requests as its own read-only caller. `signedGet` is
// injected so this module never uses Vercel OIDC, the web's RDP client or the
// `river-data-platform-<stage>-vercel-<env>` roles. Identity, unit, datum,
// integrity and freshness are judged by `assessEvidence`, not here.

import { HPP_RULE_V1 } from "../../libs/hpp/hppDecision.js";

export const COLWICK_LOOKBACK_MS = 2 * 60 * 60 * 1000;
export const COLWICK_ROW_BUDGET = 64;
const API_URL = /^https:\/\/[a-z0-9]{1,32}\.execute-api\.eu-west-1\.amazonaws\.com\/(staging|production)$/;

const failure = (code) => Object.assign(new Error(`RDP Colwick read ${code}`), { code });

function httpFailure(status) {
  if (status === 401 || status === 403) return failure("AUTHORIZATION_FAILED");
  if (status === 429) return failure("THROTTLED");
  return failure("UPSTREAM_ERROR");
}

/**
 * `signedGet(url)` performs one SigV4-signed GET and resolves `{ status, body }`
 * with `body` parsed JSON (or undefined). Returns `readEvidence(now)` which
 * resolves `{ pageIntegrity, rows }` or throws an error with a fixed `code`.
 */
export function createRdpColwickReader({
  apiUrl,
  signedGet,
  rule = HPP_RULE_V1,
  lookbackMs = COLWICK_LOOKBACK_MS,
  rowBudget = COLWICK_ROW_BUDGET,
}) {
  if (typeof apiUrl !== "string" || !API_URL.test(apiUrl) || typeof signedGet !== "function") {
    throw failure("CONFIGURATION_ERROR");
  }

  return async function readEvidence(now) {
    const url = new URL(`${apiUrl}/v1/measurements/${encodeURIComponent(rule.measurementId)}/observations`);
    url.search = new URLSearchParams({
      from: new Date(now.getTime() - lookbackMs).toISOString(),
      to: now.toISOString(),
      limit: String(rowBudget + 1),
    }).toString();

    let response;
    try {
      response = await signedGet(url.toString());
    } catch (error) {
      throw failure(error?.code === "TIMEOUT" ? "TIMEOUT" : "NETWORK_ERROR");
    }
    if (!response || response.status < 200 || response.status >= 300) throw httpFailure(response?.status);

    const { body } = response;
    if (!body?.meta || body.meta.measurementId !== rule.measurementId || !Array.isArray(body.data)) {
      throw failure("RESPONSE_CONTRACT_ERROR");
    }
    if (body.data.length > rowBudget || body.meta.nextCursor) throw failure("CATCHUP_BUDGET_EXCEEDED");
    return { pageIntegrity: body.meta.pageIntegrity, rows: body.data };
  };
}
