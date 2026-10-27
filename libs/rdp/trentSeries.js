import "server-only";
import { RdpError } from "./errors.js";
import { OPERATIONAL_STALE_MS } from "../operationalHealth";
import { TRENT_DASHBOARD_READING_LIMIT } from "../trentWeirsConfig";

export const TRENT_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const TRENT_HISTORY_PAGE_LIMIT = 1000;
// 7 days at 15 minutes is 672 rows: normally one page. More than this many pages means
// the newest rows were not reached, so the series is incomplete and fails as a whole.
export const TRENT_HISTORY_MAX_PAGES = 3;
const REJECTED_LEGACY_QUALITY = new Set(["Suspect", "Rejected", "Missing"]);

// Matches the Environment Agency `dateTime` format already served by /api/trentweirs.
export function formatObservedAt(value) {
  return new Date(value).toISOString().replace(/\.000Z$/, "Z");
}

// Reads one bounded 7-day RDP window and returns the existing newest-first reading shape.
export async function readTrentHistory(client, measurementId, now = new Date()) {
  const to = now.toISOString();
  const from = new Date(now.getTime() - TRENT_HISTORY_WINDOW_MS).toISOString();
  const rows = [];
  let cursor;

  for (let page = 0; page < TRENT_HISTORY_MAX_PAGES; page++) {
    const result = await client.getObservations(measurementId, { from, to, limit: TRENT_HISTORY_PAGE_LIMIT, cursor });
    rows.push(...result.data);
    cursor = result.meta.nextCursor ?? undefined;

    if (cursor === undefined) {
      return toNewestFirstReadings(rows);
    }
  }

  throw new RdpError("PAGINATION_LIMIT");
}

function toNewestFirstReadings(rows) {
  const times = rows.map((row) => Date.parse(row.observedAt));

  // RDP pages are chronological; a repeat or reversal means the pages cannot be trusted as one series.
  if (times.some((time, index) => index > 0 && time <= times[index - 1])) {
    throw new RdpError("RESPONSE_CONTRACT_ERROR");
  }

  return rows
    .slice(-TRENT_DASHBOARD_READING_LIMIT)
    .reverse()
    .map((row) => ({ dateTime: formatObservedAt(row.observedAt), value: row.value }));
}

// Validates a complete legacy EA series for use as display fallback; null rejects the whole series.
export function validateLegacySeries(items, measure) {
  const expectedMeasure = `/measures/${measure.providerMeasureId}`;

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const readings = [];
  for (const item of items) {
    const value = typeof item?.value === "number" ? item.value : Number(item?.value);
    const time = Date.parse(item?.dateTime);

    if (typeof item?.measure !== "string" || !item.measure.endsWith(expectedMeasure) ||
        !Number.isFinite(value) || !Number.isFinite(time) || REJECTED_LEGACY_QUALITY.has(item.quality) ||
        (readings.length > 0 && time >= Date.parse(readings.at(-1).dateTime))) {
      return null;
    }

    readings.push({ dateTime: item.dateTime, value });
  }

  return readings;
}

export function getSeriesAgeSeconds(readings, now = new Date()) {
  const newest = Date.parse(readings?.[0]?.dateTime);
  return Number.isFinite(newest) ? Math.max(0, Math.floor((now.getTime() - newest) / 1000)) : null;
}

export function isSeriesFresh(readings, now = new Date()) {
  const ageSeconds = getSeriesAgeSeconds(readings, now);
  return ageSeconds !== null && ageSeconds <= OPERATIONAL_STALE_MS / 1000;
}
