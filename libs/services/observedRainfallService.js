import "server-only";
import { unstable_cache } from "next/cache";
import { createRdpClient } from "../rdp/client.js";
import { RdpError } from "../rdp/errors.js";
import { RDP_RAINFALL_MEASUREMENTS } from "../rdp/measurements.js";
import { alignToPeriod, countGrid, RAINFALL_PERIOD_MS, summariseGauge } from "../rainfall/observedRainfall.js";

// Observed rainfall context for /trentweirs#rainfall (Wave C C2). Display only: it never feeds HPP status, alerts,
// forecasts or the predictor. Reads are bounded to the six published RDP rain gauges over 78 hours (312 labels each,
// one page normally), shared through the data cache for one 15-minute bucket. See docs/RDP-RAINFALL-CONTEXT.md.

const HOUR_MS = 3600000;
export const RAINFALL_WINDOW_HOURS = Object.freeze([6, 24, 72]);
// The longest window plus the most source delay we still anchor windows on (see summariseGauge).
export const RAINFALL_ANCHOR_LAG_MS = 6 * HOUR_MS;
export const RAINFALL_RANGE_MS = 72 * HOUR_MS + RAINFALL_ANCHOR_LAG_MS;
export const RAINFALL_PAGE_LIMIT = 1000;
export const RAINFALL_MAX_PAGES = 3;
export const RAINFALL_DEADLINE_MS = 25000;
export const RAINFALL_REVALIDATE_SECONDS = 900;
export const RAINFALL_SOURCE = "river-data-platform-rainfall";

const UNAVAILABLE_REASONS = {
  CONFIGURATION_ERROR: "not_configured",
  AUTHENTICATION_FAILED: "not_authorised",
  AUTHORIZATION_FAILED: "not_authorised",
  MEASUREMENT_NOT_FOUND: "not_published",
  NOT_FOUND: "not_published",
  RESPONSE_CONTRACT_ERROR: "invalid_response",
  PAGINATION_LIMIT: "invalid_response",
};

export function unavailableReason(error) {
  return UNAVAILABLE_REASONS[error instanceof RdpError ? error.code : ""] ?? "temporarily_unavailable";
}

let client = null;
function getClient() {
  client ??= createRdpClient();
  return client;
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RdpError("TIMEOUT")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Pages are followed only when RDP splits the range; then RDP offers no window summary (windowUnavailable: paginated).
export async function readRainfallHistory(rdp, id, from, to) {
  const intervals = [];
  let window = null;
  let paginated = false;
  let cursor;
  for (let page = 0; page < RAINFALL_MAX_PAGES; page++) {
    const result = await rdp.getRainfallObservations(id, { from, to, limit: RAINFALL_PAGE_LIMIT, cursor });
    if (intervals.length && result.intervals.length && result.intervals[0].labelMs <= intervals.at(-1).labelMs) {
      throw new RdpError("RESPONSE_CONTRACT_ERROR");
    }
    intervals.push(...result.intervals);
    if (page === 0 && result.nextCursor === null) window = result.window;
    paginated ||= result.nextCursor !== null;
    if (result.nextCursor === null) return { intervals, window, paginated };
    cursor = result.nextCursor;
  }
  throw new RdpError("PAGINATION_LIMIT");
}

const IDS = RDP_RAINFALL_MEASUREMENTS.map((measure) => measure.measurementId);
const readCachedLatest = unstable_cache(() => getClient().getRainfallLatest(IDS), ["rdp-rainfall-latest-v1"],
  { revalidate: RAINFALL_REVALIDATE_SECONDS, tags: ["rdp-rainfall"] });
// Keyed by the 15-minute-aligned range, so a cached page never outlives its bucket by more than one revalidation.
// Values are JSON-cloned by the cache; every field (including labelMs) is a plain value.
const readCachedHistory = unstable_cache((id, from, to) => readRainfallHistory(getClient(), id, from, to), ["rdp-rainfall-history-v1"],
  { revalidate: RAINFALL_REVALIDATE_SECONDS, tags: ["rdp-rainfall"] });

function buildGauge(measure, latestResult, historyResult, range) {
  const { measurementId, name, reference, area, unit } = measure;
  const base = { measurementId, name, reference, area, unit, periodMinutes: RAINFALL_PERIOD_MS / 60000 };
  const latest = latestResult.status === "fulfilled" ? latestResult.value.find((row) => row.measurementId === measurementId) : null;
  const latestSummary = latest?.status === "available"
    ? { label: latest.label, labelConvention: latest.labelConvention, periodStart: latest.periodStart, periodEnd: latest.periodEnd,
      totalMm: latest.totalMm, eligible: latest.eligible, freshness: latest.freshness }
    : null;

  if (historyResult.status === "rejected") {
    return { ...base, status: "unavailable", unavailableReason: unavailableReason(historyResult.reason), latest: latestSummary };
  }

  const { intervals, window, paginated } = historyResult.value;
  if (window) {
    // RDP's own grid summary must agree with what we were served, or neither can be trusted.
    const local = countGrid(intervals, range.fromMs, range.toMs);
    if (["expected", "reported", "eligible", "absent", "ineligible"].some((key) => local[key] !== window[key]) || window.notKnownAt) {
      return { ...base, status: "unavailable", unavailableReason: "invalid_response", latest: latestSummary };
    }
  }
  const status = intervals.length === 0 ? (latest?.status === "no_observations" ? "no_observations" : "no_recent_data") : "available";
  return {
    ...base,
    status,
    latest: latestSummary,
    rangeSummary: window ? { status: window.status, expected: window.expected, reported: window.reported, absent: window.absent, ineligible: window.ineligible }
      : null,
    rangeSummaryUnavailable: window ? null : paginated ? "paginated" : null,
    ...summariseGauge(intervals, { fromMs: range.fromMs, toMs: range.toMs, windowHours: RAINFALL_WINDOW_HOURS, maxAnchorLagMs: RAINFALL_ANCHOR_LAG_MS }),
  };
}

export function buildUnavailableRainfallPayload(reason = "temporarily_unavailable", now = new Date()) {
  return {
    generatedAt: now.toISOString(),
    source: RAINFALL_SOURCE,
    status: "unavailable",
    unavailableReason: reason,
    range: null,
    windowHours: RAINFALL_WINDOW_HOURS,
    gauges: RDP_RAINFALL_MEASUREMENTS.map(({ measurementId, name, reference, area, unit }) => ({
      measurementId, name, reference, area, unit, periodMinutes: RAINFALL_PERIOD_MS / 60000, status: "unavailable", unavailableReason: reason, latest: null,
    })),
  };
}

/**
 * Six gauges × 78 h of 15-minute labels, read server-side in one bounded pass. Each gauge succeeds or fails on its
 * own; a failure is reported as unavailable with a coarse reason, never as zero rainfall.
 */
export async function getObservedRainfallContext({ now = new Date(), client: injected } = {}) {
  const toMs = alignToPeriod(now.getTime()) + RAINFALL_PERIOD_MS;
  const range = { fromMs: toMs - RAINFALL_RANGE_MS, toMs };
  const from = new Date(range.fromMs).toISOString();
  const to = new Date(range.toMs).toISOString();

  if (!injected) {
    try {
      getClient();
    } catch (error) {
      return buildUnavailableRainfallPayload(unavailableReason(error), now);
    }
  }

  const readLatest = injected ? () => injected.getRainfallLatest(IDS) : readCachedLatest;
  const readHistory = injected ? (id) => readRainfallHistory(injected, id, from, to) : (id) => readCachedHistory(id, from, to);
  const [latestResult, ...historyResults] = await Promise.allSettled([
    withDeadline(readLatest(), RAINFALL_DEADLINE_MS),
    ...IDS.map((id) => withDeadline(readHistory(id), RAINFALL_DEADLINE_MS)),
  ]);

  const gauges = RDP_RAINFALL_MEASUREMENTS.map((measure, index) => buildGauge(measure, latestResult, historyResults[index], range));
  const failed = gauges.filter((gauge) => gauge.status === "unavailable").length;
  return {
    generatedAt: now.toISOString(),
    source: RAINFALL_SOURCE,
    status: failed === 0 ? "available" : failed === gauges.length ? "unavailable" : "partial",
    unavailableReason: failed === gauges.length ? gauges[0].unavailableReason : null,
    range: { from, to },
    windowHours: RAINFALL_WINDOW_HOURS,
    gauges,
  };
}
