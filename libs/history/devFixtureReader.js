import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Local development only (see scripts/fetch-history-fixtures.mjs). Serves fixture rows
// through the same getObservations contract as the RDP client, reporting unknown
// coverage exactly as RDP does while coverage.json is empty. Never used in production.
export function isDevFixtureEnabled(env = process.env) {
  return env.NODE_ENV === "development" && typeof env.HISTORY_DEV_FIXTURE_DIR === "string" && env.HISTORY_DEV_FIXTURE_DIR.length > 0;
}

export function createDevFixtureReader(dir) {
  const years = new Map();
  const loadYear = (year) => {
    if (!years.has(year)) {
      years.set(year, readFile(path.join(dir, `ea-colwick-level-${year}.json`), "utf8")
        .then(JSON.parse).catch(() => []));
    }
    return years.get(year);
  };

  return {
    async getObservations(id, { from, to }) {
      const fromMs = Date.parse(from);
      const toMs = Date.parse(to);
      const rows = [];
      for (let year = new Date(fromMs).getUTCFullYear(); year <= new Date(toMs).getUTCFullYear(); year++) {
        rows.push(...(await loadYear(year)).filter((row) => {
          const time = Date.parse(row.observedAt);
          return time >= fromMs && time < toMs;
        }));
      }
      return {
        data: rows,
        meta: { measurementId: id, from, to, requestAsOf: new Date().toISOString(), cutoff: null,
          coverage: { status: "unknown", gaps: [{ from, to, reason: "unknown" }] }, pageIntegrity: "verified", nextCursor: null },
      };
    },
  };
}
