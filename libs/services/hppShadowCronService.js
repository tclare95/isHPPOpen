import { HttpError } from "../api/http";
import { connectToDatabase } from "../database";
import { createHppAuthoritativeService } from "../hpp/hppAuthoritativeService.js";
import { createHppShadowService } from "../hpp/hppShadowService.js";
import { OWNERS, ownerOf } from "../hpp/hppWriterControl.js";

// Scheduled HPP evaluation (#89). `HPP_STATUS_SOURCE` selects the mode:
// - "legacy" (default): no-op; the scraper remains the only HPP writer.
// - "shadow": evaluate RDP Colwick evidence and write only the hppShadow*
//   collections.
// - "authoritative": permits the app to write openIndicator, but only while
//   the writer control document names the app and the scraper has
//   acknowledged it stopped (see hppWriterControl.js). Until an operator
//   hands over with scripts/hpp-writer.mjs it behaves exactly like "shadow".
// Every mode writes only when VERCEL_ENV=production (Preview shares the database).
export const HPP_STATUS_SOURCES = Object.freeze(["legacy", "shadow", "authoritative"]);

export function getHppStatusSource(env = process.env) {
  const mode = env.HPP_STATUS_SOURCE ?? "legacy";
  if (!HPP_STATUS_SOURCES.includes(mode)) throw new HttpError(500, "Invalid HPP status source");
  return mode;
}

// Writes are allowed only in Vercel Production until Preview data is isolated.
const writesAllowed = (env) => env.VERCEL_ENV === "production";

async function createServices() {
  const { db } = await connectToDatabase();
  return { shadow: createHppShadowService({ db }), authoritative: createHppAuthoritativeService({ db }) };
}

/** One cron invocation. Returns a compact, credential-free summary for logs and the response. */
export async function runHppShadowCron({ env = process.env, now = new Date(), runId, create = createServices } = {}) {
  const mode = getHppStatusSource(env);
  if (mode === "legacy") return { mode, ran: false, reason: "disabled" };
  if (!writesAllowed(env)) return { mode, ran: false, reason: "non_production" };

  const services = await create();
  const owner = ownerOf(await services.authoritative.store.loadControl());
  const authoritative = mode === "authoritative" && owner === OWNERS.APP;
  const result = await (authoritative ? services.authoritative : services.shadow).runOnce({ now, runId });
  return {
    mode,
    ran: true,
    writer: owner,
    authoritative,
    // Nobody writes openIndicator: the control names the app but this mode will not.
    warning: owner === OWNERS.APP && !authoritative ? "control_names_app_but_mode_is_not_authoritative" : null,
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

/** Read-only shadow and writer evidence for operators. Reads only. */
export async function getHppShadowReport({ env = process.env, now = new Date(), create = createServices } = {}) {
  const mode = getHppStatusSource(env);
  if (mode === "legacy") return { mode, status: "disabled" };
  const services = await create();
  const [report, writer] = await Promise.all([services.shadow.report({ now }), services.authoritative.writerReport({ now })]);
  return { mode, ...report, writer };
}
