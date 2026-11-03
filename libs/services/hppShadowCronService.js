import { HttpError } from "../api/http";
import { connectToDatabase } from "../database";
import { createHppShadowService } from "../hpp/hppShadowService.js";

// Scheduled HPP shadow evaluation (#89). `HPP_STATUS_SOURCE` selects the mode:
// - "legacy" (default): no-op; the scraper remains the only HPP writer.
// - "shadow": evaluate RDP Colwick evidence and write only the hppShadow*
//   collections, in Production only (Preview shares the production database).
// There is no authoritative mode: writing openIndicator is a separate change.
export const HPP_STATUS_SOURCES = Object.freeze(["legacy", "shadow"]);

export function getHppStatusSource(env = process.env) {
  const mode = env.HPP_STATUS_SOURCE ?? "legacy";
  if (!HPP_STATUS_SOURCES.includes(mode)) throw new HttpError(500, "Invalid HPP status source");
  return mode;
}

// Shadow writes are allowed only in Vercel Production until Preview data is isolated.
const shadowWritesAllowed = (env) => env.VERCEL_ENV === "production";

async function createService() {
  const { db } = await connectToDatabase();
  return createHppShadowService({ db });
}

/** One cron invocation. Returns a compact, credential-free summary for logs and the response. */
export async function runHppShadowCron({ env = process.env, now = new Date(), runId, create = createService } = {}) {
  const mode = getHppStatusSource(env);
  if (mode === "legacy") return { mode, ran: false, reason: "disabled" };
  if (!shadowWritesAllowed(env)) return { mode, ran: false, reason: "non_production" };

  const service = await create();
  const result = await service.runOnce({ now, runId });
  return {
    mode,
    ran: true,
    action: result.action,
    reason: result.reason ?? null,
    persisted: result.persisted,
    sourceError: result.sourceError ?? null,
    transitionId: result.transitionId ?? null,
    state: result.state ?? null,
    observedAt: result.health?.lastObservedAt ?? null,
    observationAgeMs: result.health?.lastObservationAgeMs ?? null,
  };
}

/** Read-only shadow evidence for operators. Reads only; available whenever the mode is shadow. */
export async function getHppShadowReport({ env = process.env, now = new Date(), create = createService } = {}) {
  const mode = getHppStatusSource(env);
  if (mode === "legacy") return { mode, status: "disabled" };
  const service = await create();
  return { mode, ...(await service.report({ now })) };
}
