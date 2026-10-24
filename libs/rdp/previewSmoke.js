import "server-only";
import { createRdpClient } from "./client.js";
import { getRdpConfig } from "./config.js";
import { assertRdpCatalogueMeasurement } from "./measurements.js";
import { RdpError } from "./errors.js";

// Explicit build command only; never imported by a route or the normal build.
export async function runRdpPreviewSmoke(env = process.env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview") throw new RdpError("PREVIEW_SMOKE_ONLY");
  const config = getRdpConfig(env);
  if (Object.values(config.sources).some((mode) => mode !== "legacy")) throw new RdpError("LEGACY_SOURCES_REQUIRED");
  const client = createRdpClient(env);
  const catalogue = await client.listMeasurements();
  const aliases = ["4009-level", "4007-level", "4007-flow"];
  const ids = aliases.map((alias) => assertRdpCatalogueMeasurement(alias, catalogue.data).measurementId);
  const latest = await client.getLatest(ids);
  await client.getHealth(ids[0]);
  const to = new Date();
  const history = await client.getObservations(ids[0], {
    from: new Date(to.getTime() - 7 * 86400000).toISOString(), to: to.toISOString(), limit: 2,
  });
  return {
    result: "passed", environment: "preview", stage: "staging", context: "vercel-build",
    deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null, gitCommit: env.VERCEL_GIT_COMMIT_SHA ?? null,
    checks: ["registry", "latest", "health", "history"],
    latest: latest.data.map(({ measurementId, status, freshness }) => ({ measurementId, status, freshness })),
    historyRows: history.data.length,
    sources: config.sources,
  };
}
