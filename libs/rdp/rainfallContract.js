import "server-only";
import { RdpError } from "./errors.js";
import { getRainfallMeasurement } from "./measurements.js";

// Strict parsing of RDP period-total (#54 observed rainfall) envelopes: `PeriodTotalLatest` and
// `PeriodTotalHistoryResponse` in RDP's openapi.json. A response that breaks the contract is refused as a whole
// (RESPONSE_CONTRACT_ERROR) rather than shown as a guess. Nothing here fills gaps, shifts labels or infers a convention.

export const RAINFALL_PERIOD_SECONDS = 900;
const PERIOD_MS = RAINFALL_PERIOD_SECONDS * 1000;
const CONVENTIONS = new Set(["period_end", "period_start", "unverified"]);
const WINDOW_CONVENTIONS = new Set([...CONVENTIONS, "mixed"]);
const WINDOW_STATUSES = new Set(["complete", "incomplete", "unknown", "empty"]);
const INELIGIBLE_REASONS = new Set(["QualityMissing", "QualitySuspect", "NegativeDepth"]);
const GAP_REASONS = new Set(["absent", "ineligible", "not_known_at"]);

function fail() {
  throw new RdpError("RESPONSE_CONTRACT_ERROR");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function time(value) {
  const ms = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

// The physical boundaries must match the declared convention exactly; `unverified` must offer none.
function boundaries(labelMs, convention, periodStart, periodEnd) {
  if (convention === null || convention === "unverified") {
    if (periodStart !== null || periodEnd !== null) fail();
    return { periodStart: null, periodEnd: null };
  }
  const start = convention === "period_end" ? labelMs - PERIOD_MS : labelMs;
  if (time(periodStart) !== start || time(periodEnd) !== start + PERIOD_MS) fail();
  return { periodStart: iso(start), periodEnd: iso(start + PERIOD_MS) };
}

function gridLabel(value) {
  const ms = time(value);
  if (ms === null || ms % PERIOD_MS !== 0) fail();
  return ms;
}

export function parseRainfallLatest(body, ids) {
  if (!isObject(body) || !isObject(body.meta) || !Array.isArray(body.data) || body.data.length !== ids.length) fail();
  return body.data.map((row, index) => {
    const id = ids[index];
    getRainfallMeasurement(id);
    if (!isObject(row) || row.measurementId !== id || row.valueType !== "total" || row.periodSeconds !== RAINFALL_PERIOD_SECONDS ||
        row.unit !== "mm" || Object.hasOwn(row, "value") || Object.hasOwn(row, "observedAt") ||
        !["available", "no_observations", "unavailable"].includes(row.status) ||
        !["fresh", "stale", "unknown"].includes(row.freshness)) fail();
    if (row.status !== "available") {
      return { measurementId: id, status: row.status, freshness: row.freshness, label: null };
    }
    const labelMs = gridLabel(row.label);
    if (!CONVENTIONS.has(row.labelConvention) || typeof row.eligible !== "boolean" ||
        !(row.totalMm === null || (Number.isFinite(row.totalMm) && row.totalMm >= 0)) ||
        !Number.isFinite(row.labelAgeSeconds) || row.labelAgeSeconds < 0) fail();
    return {
      measurementId: id, status: "available", freshness: row.freshness, label: iso(labelMs), labelConvention: row.labelConvention,
      ...boundaries(labelMs, row.labelConvention, row.periodStart, row.periodEnd),
      totalMm: row.eligible ? row.totalMm : null, eligible: row.eligible, labelAgeSeconds: row.labelAgeSeconds,
    };
  });
}

function parseInterval(row, measure) {
  if (!isObject(row) || row.periodSeconds !== RAINFALL_PERIOD_SECONDS || !CONVENTIONS.has(row.labelConvention) ||
      !Number.isFinite(row.totalMm) || row.totalMm < 0 || typeof row.eligible !== "boolean" ||
      row.sourceId !== "ea-flood-monitoring" || row.providerMeasureId !== measure.providerMeasureId ||
      !Number.isInteger(row.revision) || row.revision < 1 || time(row.ingestedAt) === null ||
      (row.eligible ? row.ineligibleReason !== null : !INELIGIBLE_REASONS.has(row.ineligibleReason))) fail();
  const labelMs = gridLabel(row.label);
  return {
    label: iso(labelMs), labelMs, labelConvention: row.labelConvention,
    ...boundaries(labelMs, row.labelConvention, row.periodStart, row.periodEnd),
    // An ineligible depth (Missing/Suspect/negative) is never a usable amount, not even zero.
    totalMm: row.eligible ? row.totalMm : null, eligible: row.eligible, ineligibleReason: row.ineligibleReason, revision: row.revision,
  };
}

function parseWindow(window) {
  const counts = ["expectedIntervals", "reported", "eligible", "absent", "ineligible", "notKnownAt"];
  if (!isObject(window) || !counts.every((key) => nonNegativeInteger(window[key])) || !WINDOW_STATUSES.has(window.status) ||
      !WINDOW_CONVENTIONS.has(window.labelConvention) || !Array.isArray(window.gaps) || typeof window.gapsTruncated !== "boolean" ||
      window.expectedIntervals !== window.reported + window.absent || window.reported !== window.eligible + window.ineligible ||
      (window.status === "complete" ? !Number.isFinite(window.totalMm) || window.totalMm < 0 : window.totalMm !== null) ||
      window.gaps.some((gap) => !isObject(gap) || time(gap.fromLabel) === null || time(gap.toLabel) === null ||
        !nonNegativeInteger(gap.intervals) || !GAP_REASONS.has(gap.reason))) fail();
  return {
    status: window.status, expected: window.expectedIntervals, reported: window.reported, eligible: window.eligible,
    absent: window.absent, ineligible: window.ineligible, notKnownAt: window.notKnownAt, totalMm: window.totalMm, labelConvention: window.labelConvention,
  };
}

export function parseRainfallHistory(body, id) {
  const measure = getRainfallMeasurement(id);
  const meta = body?.meta;
  if (!isObject(body) || !isObject(meta) || !Array.isArray(body.data) || body.data.length > 5000 ||
      meta.measurementId !== id || meta.valueType !== "total" || meta.periodSeconds !== RAINFALL_PERIOD_SECONDS ||
      meta.pageIntegrity !== "verified" ||
      !(meta.nextCursor === null || (typeof meta.nextCursor === "string" && /^[A-Za-z0-9_-]{1,7000}$/.test(meta.nextCursor))) ||
      (meta.window === null ? meta.windowUnavailable !== "paginated" : meta.windowUnavailable !== null)) fail();
  const intervals = body.data.map((row) => parseInterval(row, measure));
  // Pages are chronological by label with no repeats; anything else cannot be trusted as one series.
  if (intervals.some((row, index) => index > 0 && row.labelMs <= intervals[index - 1].labelMs)) fail();
  return { measurementId: id, intervals, window: meta.window === null ? null : parseWindow(meta.window), nextCursor: meta.nextCursor };
}
