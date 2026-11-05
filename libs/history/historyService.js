import "server-only";
import { unstable_cache } from "next/cache";
import { createRdpClient } from "../rdp/client.js";
import { RdpError } from "../rdp/errors.js";
import { buildOverview, combineCoverage, combineSummaries } from "./aggregate.js";
import { COLWICK_HISTORY, MONTH_NAMES } from "./config.js";
import { createDevFixtureReader, isDevFixtureEnabled } from "./devFixtureReader.js";
import { buildPeriodDigest } from "./digest.js";
import { readObservationWindow } from "./source.js";
import { currentLondonMonth, monthBounds, yearBounds } from "./ukCalendar.js";

// Completed months change only through provider revisions or new imports: refresh daily.
// The current month follows the operational 15-minute cadence.
export const PAST_MONTH_REVALIDATE_SECONDS = 24 * 60 * 60;
export const CURRENT_MONTH_REVALIDATE_SECONDS = 15 * 60;
export const HISTORY_READ_CONCURRENCY = 4;
// Leaves headroom inside the route's 60s maxDuration. Months not started by then are
// reported as not yet loaded; months already read stay cached for the next request.
export const OVERVIEW_DEADLINE_MS = 40 * 1000;
const CACHE_TAG = "history-colwick";

let reader = null;
function getReader() {
  reader ??= isDevFixtureEnabled() ? createDevFixtureReader(process.env.HISTORY_DEV_FIXTURE_DIR) : createRdpClient();
  return reader;
}

export const MEASUREMENT = Object.freeze({
  measurementId: COLWICK_HISTORY.measurementId,
  station: COLWICK_HISTORY.stationName,
  providerStationId: COLWICK_HISTORY.providerStationId,
  unit: COLWICK_HISTORY.unit,
  datum: COLWICK_HISTORY.datum,
  thresholdMetres: COLWICK_HISTORY.thresholdMetres,
  timeZone: COLWICK_HISTORY.timeZone,
  firstYear: COLWICK_HISTORY.firstYear,
  source: "river-data-platform",
});

async function computeMonth(year, month) {
  const now = Date.now();
  const { from, to } = monthBounds(year, month);
  const pad = COLWICK_HISTORY.maxSupportedGapMs;
  const readTo = Math.min(to + pad, Math.ceil(now / 60000) * 60000);
  const { rows, coverage, requestAsOf } = await readObservationWindow(getReader(), COLWICK_HISTORY.measurementId, from - pad, readTo);
  return {
    year, month, label: `${MONTH_NAMES[month - 1]} ${year}`,
    ...buildPeriodDigest(rows, { from, to, asOf: now, coverage }),
    source: { requestAsOf: requestAsOf ?? new Date(now).toISOString(), readAt: new Date(now).toISOString() },
  };
}

const cachedPastMonth = unstable_cache(computeMonth, ["history-colwick-month-v1"],
  { revalidate: PAST_MONTH_REVALIDATE_SECONDS, tags: [CACHE_TAG] });
const cachedCurrentMonth = unstable_cache(computeMonth, ["history-colwick-current-month-v1"],
  { revalidate: CURRENT_MONTH_REVALIDATE_SECONDS, tags: [CACHE_TAG] });

function isCurrentMonth(year, month, now = Date.now()) {
  const current = currentLondonMonth(now);
  return current.year === year && current.month === month;
}

export function getMonthEvidence(year, month) {
  return isCurrentMonth(year, month) ? cachedCurrentMonth(year, month) : cachedPastMonth(year, month);
}

const withoutReadings = ({ readings, ...digest }) => digest;

// Digest-only cache keeps year/overview composition small (no raw readings).
const cachedPastDigest = unstable_cache(async (year, month) => withoutReadings(await cachedPastMonth(year, month)),
  ["history-colwick-month-digest-v1"], { revalidate: PAST_MONTH_REVALIDATE_SECONDS, tags: [CACHE_TAG] });

function getMonthDigest(year, month) {
  return isCurrentMonth(year, month) ? cachedCurrentMonth(year, month).then(withoutReadings) : cachedPastDigest(year, month);
}

// Settles every task with bounded concurrency; tasks not started before the deadline fail
// with DEADLINE instead of running past the function budget.
async function settleAll(items, task, { concurrency = HISTORY_READ_CONCURRENCY, deadline = Infinity } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      if (Date.now() > deadline) {
        results[index] = { error: new RdpError("DEADLINE") };
        continue;
      }
      try {
        results[index] = { value: await task(items[index]) };
      } catch (error) {
        results[index] = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function monthsOfYear(year, now = Date.now()) {
  const current = currentLondonMonth(now);
  const last = year === current.year ? current.month : 12;
  return Array.from({ length: last }, (_, index) => ({ year, month: index + 1 }));
}

export const errorCode = (error) => (error instanceof RdpError ? error.code : "UNEXPECTED");

export async function getYearHistory(year) {
  const months = monthsOfYear(year);
  const results = await settleAll(months, ({ month }) => getMonthDigest(year, month));
  const loaded = results.filter((result) => result.value).map((result) => result.value);
  if (!loaded.length) throw results[0].error;
  const { from, to } = yearBounds(year);
  return {
    measurement: MEASUREMENT,
    year,
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), inProgress: loaded.some((m) => m.period.inProgress) || months.length < 12 },
    coverage: combineCoverage(loaded.map((m) => m.coverage)),
    summary: combineSummaries(loaded),
    months: months.map(({ month }, index) => (results[index].value
      ? { month, status: "available", inProgress: results[index].value.period.inProgress, coverage: results[index].value.coverage.status, summary: results[index].value.summary }
      : { month, status: "read_failed", error: errorCode(results[index].error) })),
    days: loaded.flatMap((m) => m.days),
    source: { readAt: new Date().toISOString(), oldestReadAt: loaded.map((m) => m.source.readAt).sort()[0] },
  };
}

export async function getMonthHistory(year, month) {
  return { measurement: MEASUREMENT, ...(await getMonthEvidence(year, month)) };
}

export async function getHistoryOverview() {
  const now = Date.now();
  const current = currentLondonMonth(now);
  const months = [];
  for (let year = COLWICK_HISTORY.firstYear; year <= current.year; year++) months.push(...monthsOfYear(year, now));

  // Newest first, so a deadline-limited cold build still serves recent context.
  const order = months.map((_, index) => index).reverse();
  const settled = await settleAll(order, (index) => getMonthDigest(months[index].year, months[index].month),
    { deadline: now + OVERVIEW_DEADLINE_MS });
  const results = new Array(months.length);
  order.forEach((index, position) => { results[index] = settled[position]; });
  if (!results.some((result) => result.value)) throw results.at(-1).error;

  const overview = buildOverview(months.map((item, index) => ({
    ...item, digest: results[index].value, error: results[index].error ? errorCode(results[index].error) : undefined,
  })), { currentYear: current.year });
  const readTimes = results.filter((result) => result.value).map((result) => result.value.source.readAt).sort();
  return {
    measurement: MEASUREMENT,
    ...overview,
    source: { generatedAt: new Date(now).toISOString(), oldestReadAt: readTimes[0] ?? null },
  };
}

const ERROR_RESPONSES = {
  integrity: { status: 503, message: "Archived observations for this period could not be verified, so no partial history is shown." },
  temporary: { status: 503, message: "River history is temporarily unavailable. Please try again shortly." },
  unavailable: { status: 503, message: "River history is not available in this environment." },
  unreliable: { status: 502, message: "River history could not be read reliably, so nothing is shown rather than an incomplete record." },
};
const ERROR_KINDS = {
  ARCHIVE_INTEGRITY: "integrity",
  STORAGE_UNAVAILABLE: "temporary", QUERY_TIMEOUT: "temporary", TIMEOUT: "temporary", THROTTLED: "temporary",
  NETWORK_ERROR: "temporary", UPSTREAM_ERROR: "temporary", CURSOR_EXPIRED: "temporary", CURSOR_STALE: "temporary", DEADLINE: "temporary",
  CONFIGURATION_ERROR: "unavailable", AUTHENTICATION_FAILED: "unavailable", AUTHORIZATION_FAILED: "unavailable",
};

// Maps any failure to a fixed public reason; raw errors never leave the server.
export function describeHistoryError(error) {
  const code = errorCode(error);
  const reason = ERROR_KINDS[code] ?? "unreliable";
  return { ...ERROR_RESPONSES[reason], reason, code };
}

export function __resetHistoryReaderForTests() {
  reader = null;
}
