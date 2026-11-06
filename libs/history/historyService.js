import "server-only";
import { unstable_cache } from "next/cache";
import { createRdpClient } from "../rdp/client.js";
import { RdpError } from "../rdp/errors.js";
import { buildOverview, combineCoverage, combineSummaries } from "./aggregate.js";
import { COLWICK_HISTORY, MONTH_NAMES } from "./config.js";
import { createDevFixtureReader, isDevFixtureEnabled } from "./devFixtureReader.js";
import { buildPeriodDigest } from "./digest.js";
import { EVENT_RULES, findEvent, identifyEvents } from "./events.js";
import { readObservationWindow } from "./source.js";
import { SEGMENT, stitchTimelines } from "./timeline.js";
import { currentLondonMonth, londonParts, monthBounds, yearBounds } from "./ukCalendar.js";

// Completed months change only through provider revisions or new imports: refresh daily.
// The current month follows the operational 15-minute cadence.
export const PAST_MONTH_REVALIDATE_SECONDS = 24 * 60 * 60;
export const CURRENT_MONTH_REVALIDATE_SECONDS = 15 * 60;
export const HISTORY_READ_CONCURRENCY = 4;
// Ceiling on RDP month reads in flight from one server instance, whoever started them.
// unstable_cache serves a stale entry immediately and refreshes it in the background,
// so HISTORY_READ_CONCURRENCY alone never bounds revalidation: without this gate every
// expired month (~130 of them) re-read RDP at once and tripped its 5 req/s limit.
export const HISTORY_RDP_READ_CONCURRENCY = 2;
// Completed months are spread over this many daily TTLs (24h, 25h, ... 29h) so entries
// filled together do not all expire, and revalidate, in the same minute.
export const PAST_MONTH_TTL_SPREAD = 6;
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

// FIFO gate for RDP reads; slots pass directly to the next waiter.
function createGate(limit) {
  let active = 0;
  const waiting = [];
  return async function run(task) {
    if (active < limit) active++;
    else await new Promise((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

let rdpGate = createGate(HISTORY_RDP_READ_CONCURRENCY);
// One read per month at a time: the month and digest caches, and concurrent requests,
// revalidating the same month share a single RDP read.
const inFlightMonths = new Map();

async function readMonth(year, month) {
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

function computeMonth(year, month) {
  const key = `${year}-${month}`;
  let pending = inFlightMonths.get(key);
  if (!pending) {
    pending = rdpGate(() => readMonth(year, month)).finally(() => inFlightMonths.delete(key));
    inFlightMonths.set(key, pending);
  }
  return pending;
}

// Each spread bucket keeps the same key parts, so entries cached before the spread stay
// valid; only their TTL differs. A month always maps to the same bucket.
function spreadPastCache(fn, keyParts) {
  const buckets = Array.from({ length: PAST_MONTH_TTL_SPREAD }, (_, hour) => unstable_cache(fn, keyParts,
    { revalidate: PAST_MONTH_REVALIDATE_SECONDS + hour * 60 * 60, tags: [CACHE_TAG] }));
  return (year, month) => buckets[(year * 12 + month) % PAST_MONTH_TTL_SPREAD](year, month);
}

const cachedPastMonth = spreadPastCache(computeMonth, ["history-colwick-month-v2"]);
const cachedCurrentMonth = unstable_cache(computeMonth, ["history-colwick-current-month-v2"],
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
const cachedPastDigest = spreadPastCache(async (year, month) => withoutReadings(await cachedPastMonth(year, month)),
  ["history-colwick-month-digest-v2"]);

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

// Every month since the first imported year, read newest first so a deadline-limited cold
// build still serves recent history. Failed months keep their error code.
async function loadAllMonthDigests(now) {
  const current = currentLondonMonth(now);
  const months = [];
  for (let year = COLWICK_HISTORY.firstYear; year <= current.year; year++) months.push(...monthsOfYear(year, now));
  const order = months.map((_, index) => index).reverse();
  const settled = await settleAll(order, (index) => getMonthDigest(months[index].year, months[index].month),
    { deadline: now + OVERVIEW_DEADLINE_MS });
  const results = new Array(months.length);
  order.forEach((index, position) => { results[index] = settled[position]; });
  if (!results.some((result) => result.value)) throw results.at(-1).error;
  return {
    current,
    months: months.map((item, index) => ({
      ...item, digest: results[index].value, error: results[index].error ? errorCode(results[index].error) : undefined,
    })),
    oldestReadAt: results.filter((result) => result.value).map((result) => result.value.source.readAt).sort()[0] ?? null,
  };
}

export async function getHistoryOverview() {
  const now = Date.now();
  const { current, months, oldestReadAt } = await loadAllMonthDigests(now);
  return {
    measurement: MEASUREMENT,
    ...buildOverview(months, { currentYear: current.year }),
    source: { generatedAt: new Date(now).toISOString(), oldestReadAt },
  };
}

// --- High-water events (#105) -------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
// Readings shown either side of an event on its detail chart.
export const EVENT_CONTEXT_MS = 3 * DAY_MS;
// Detail charts carry raw 15-minute readings; a longer window is trimmed and says so.
export const EVENT_MAX_WINDOW_MS = 200 * DAY_MS;

export const EVENTS_RULE = Object.freeze({
  thresholdMetres: EVENT_RULES.thresholdMetres,
  maxSupportedGapMs: EVENT_RULES.maxSupportedGapMs,
  mergeWindowMs: EVENT_RULES.mergeWindowMs,
  briefMs: EVENT_RULES.briefMs,
});

const isoOrNull = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

// Public event shape: UTC ISO instants, no internal segment bookkeeping.
export function presentEvent(event) {
  const boundary = (b) => ({
    status: b.status,
    edgeAt: isoOrNull(b.edgeAt),
    belowAt: isoOrNull(b.belowAt),
    gap: b.gap ? { from: isoOrNull(b.gap.from), to: isoOrNull(b.gap.to), reason: b.gap.reason } : null,
    beyond: b.beyond ? { state: b.beyond.state, at: isoOrNull(b.beyond.at) } : null,
    ongoing: Boolean(b.ongoing),
  });
  const interval = (item) => ({ from: isoOrNull(item.from), to: isoOrNull(item.to), ms: item.ms, ...(item.reason ? { reason: item.reason } : {}) });
  return {
    ...event,
    firstAboveAt: isoOrNull(event.firstAboveAt),
    lastAboveAt: isoOrNull(event.lastAboveAt),
    peak: { ...event.peak, at: isoOrNull(event.peak.at) },
    start: boundary(event.start),
    end: boundary(event.end),
    dips: event.dips.map(interval),
    gaps: event.gaps.map(interval),
  };
}

// Identifies events across all available history from the cached month digests the
// overview already uses: no archive reads of its own beyond those.
async function computeEvents(now) {
  const { current, months, oldestReadAt } = await loadAllMonthDigests(now);
  const timelines = months.map(({ year, month, digest }) => {
    const { from, to } = monthBounds(year, month);
    return digest
      ? { from, end: Date.parse(digest.period.end), segments: digest.timeline }
      : { from, end: Math.min(to, now), failed: true };
  });
  const segments = stitchTimelines(timelines);
  const dataEnd = timelines.at(-1).end;
  const observed = segments.filter((segment) => segment.state !== SEGMENT.UNKNOWN && segment.n > 0);
  return {
    events: identifyEvents(segments, { dataEnd }),
    currentMonthFrom: monthBounds(current.year, current.month).from,
    meta: {
      generatedAt: new Date(now).toISOString(),
      oldestReadAt,
      firstReadingAt: isoOrNull(observed[0]?.firstAt),
      lastReadingAt: isoOrNull(observed.at(-1)?.lastAt),
      dataEnd: isoOrNull(dataEnd),
      monthsFailed: months.filter((item) => !item.digest).map(({ year, month, error }) => ({ year, month, error })),
      coverage: combineCoverage(months.filter((item) => item.digest).map((item) => item.digest.coverage)).status,
    },
  };
}

export async function getEventsIndex() {
  const { events, meta } = await computeEvents(Date.now());
  return { measurement: MEASUREMENT, rule: EVENTS_RULE, ...meta, events: events.map(presentEvent) };
}

// Raw readings in [from, to) from the cached month evidence (the same reads /history uses).
async function readingsBetween(from, to) {
  const start = londonParts(from);
  const months = [];
  for (let index = 0; ; index++) {
    const year = start.year + Math.floor((start.month - 1 + index) / 12);
    const month = ((start.month - 1 + index) % 12) + 1;
    if (monthBounds(year, month).from >= to) break;
    months.push({ year, month });
  }
  const results = await settleAll(months, ({ year, month }) => getMonthEvidence(year, month));
  const fromSeconds = from / 1000;
  const toSeconds = to / 1000;
  return {
    readings: results.flatMap((result) => result.value?.readings ?? []).filter(([seconds]) => seconds >= fromSeconds && seconds < toSeconds),
    failed: months.flatMap(({ year, month }, index) => (results[index].error ? [{ year, month, error: errorCode(results[index].error) }] : [])),
  };
}

const neighbour = (event) => (event ? { id: event.id, firstAboveAt: isoOrNull(event.firstAboveAt), peak: event.peak.value } : null);

/**
 * One event with its surrounding readings. `found: false` for an unknown id; `match: "moved"`
 * when the link's instant now falls inside an event that starts elsewhere (provider revision).
 */
export async function getEventDetail(id) {
  const now = Date.now();
  const { events, meta, currentMonthFrom } = await computeEvents(now);
  const { event, index, match } = findEvent(events, id);
  if (!event) return { found: false, match, measurement: MEASUREMENT, rule: EVENTS_RULE, ...meta };

  const lead = event.start.belowAt ?? event.start.gap?.from ?? event.firstAboveAt;
  const tail = event.end.belowAt ?? event.end.gap?.to ?? event.lastAboveAt;
  let from = Math.max(monthBounds(COLWICK_HISTORY.firstYear, 1).from, Math.min(lead, event.firstAboveAt - EVENT_CONTEXT_MS));
  let to = Math.min(Date.parse(meta.dataEnd), Math.max(tail, event.lastAboveAt + EVENT_CONTEXT_MS));
  const trimmed = to - from > EVENT_MAX_WINDOW_MS;
  if (trimmed) {
    from = Math.max(from, event.firstAboveAt - EVENT_CONTEXT_MS);
    to = Math.min(to, from + EVENT_MAX_WINDOW_MS);
  }
  const { readings, failed } = await readingsBetween(from, to);
  return {
    found: true,
    match,
    measurement: MEASUREMENT,
    rule: EVENTS_RULE,
    ...meta,
    event: presentEvent(event),
    // Positions among events identified in today's history: not a permanent record.
    rank: {
      byPeak: events.filter((other) => other.peak.value > event.peak.value).length + 1,
      byDuration: events.filter((other) => other.aboveMs > event.aboveMs).length + 1,
      of: events.length,
    },
    previous: neighbour(events[index - 1]),
    next: neighbour(events[index + 1]),
    window: { from: isoOrNull(from), to: isoOrNull(to), trimmed, monthsFailed: failed },
    readings,
    inProgress: event.lastAboveAt >= currentMonthFrom || Boolean(event.end.ongoing),
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
  rdpGate = createGate(HISTORY_RDP_READ_CONCURRENCY);
  inFlightMonths.clear();
}
