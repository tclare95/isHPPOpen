import "server-only";
import { RdpError } from "../rdp/errors.js";

// One UK month plus 30-minute padding is ~2,980 rows at 15 minutes: normally a single
// 5,000-row page. RDP may end a page early to respect its 4 MiB body limit, so allow a
// few more pages; anything beyond that is a contract surprise and fails as a whole
// rather than silently truncating an apparently complete month.
export const HISTORY_PAGE_LIMIT = 5000;
export const HISTORY_MAX_PAGES = 4;
const RESTART_CODES = new Set(["CURSOR_EXPIRED", "CURSOR_STALE"]);

async function readOnce(reader, measurementId, from, to) {
  const rows = [];
  let coverage = null;
  let requestAsOf = null;
  let cursor;
  for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
    const result = await reader.getObservations(measurementId, { from, to, limit: HISTORY_PAGE_LIMIT, cursor });
    coverage ??= result.meta.coverage ?? null;
    requestAsOf ??= result.meta.requestAsOf ?? null;
    rows.push(...result.data);
    cursor = result.meta.nextCursor ?? undefined;
    if (cursor === undefined) return { rows, coverage, requestAsOf };
  }
  throw new RdpError("PAGINATION_LIMIT");
}

// Reads [from, to) completely. A cursor that expires or goes stale between pages means
// the history changed or the read was too slow: restart once from the beginning.
export async function readObservationWindow(reader, measurementId, fromMs, toMs) {
  const from = new Date(fromMs).toISOString();
  const to = new Date(toMs).toISOString();
  let result;
  try {
    result = await readOnce(reader, measurementId, from, to);
  } catch (error) {
    if (!RESTART_CODES.has(error?.code)) throw error;
    result = await readOnce(reader, measurementId, from, to);
  }

  // RDP returns one canonical (latest-revision) row per instant in ascending order. A repeat
  // or reversal means the pages cannot be trusted as one series, so the read fails.
  let previous = -Infinity;
  for (const row of result.rows) {
    const time = Date.parse(row.observedAt);
    if (!(time > previous) || time < fromMs || time >= toMs) throw new RdpError("RESPONSE_CONTRACT_ERROR");
    previous = time;
  }
  return result;
}
