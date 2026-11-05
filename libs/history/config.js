// Shared (client + server) constants for historical Colwick river conditions (#104).
// The HPP rule is imported, never restated: history describes the same boundary
// the live HPP decision uses, without changing or replaying it.
import { HPP_RULE_V1 } from "../hpp/hppDecision.js";

const MINUTE_MS = 60 * 1000;

export const COLWICK_HISTORY = Object.freeze({
  measurementId: HPP_RULE_V1.measurementId,
  stationName: "Colwick",
  providerStationId: "4009",
  unit: HPP_RULE_V1.unit,
  datum: HPP_RULE_V1.datum,
  // Rule boundary: below = below threshold; at or above = threshold met.
  thresholdMetres: HPP_RULE_V1.closedAtOrAboveMetres,
  // First calendar year of reviewed, imported RDP history (#50: 2016–2025 Colwick import).
  firstYear: 2016,
  timeZone: "Europe/London",
  expectedIntervalMs: 15 * MINUTE_MS,
  // A reading supports elapsed time only up to its neighbour, and only when that neighbour
  // is at most two expected intervals away (RDP's own freshness definition). Longer gaps
  // are unknown time, never below or above the threshold.
  maxSupportedGapMs: 30 * MINUTE_MS,
});

// Support tiers describe how much of the elapsed period the observations support.
// They never claim formal completeness: that needs RDP coverage evidence (#69).
export const SUPPORT_TIERS = Object.freeze({
  FULL: "full", // >= 98% of elapsed time supported (allows live latency at the period end)
  PARTIAL: "partial", // >= 50%
  LIMITED: "limited", // > 0%: percentages are withheld
  NONE: "none",
});

export const SUPPORT_RATIO = Object.freeze({ full: 0.98, partial: 0.5 });

export const SEASONAL_RULES = Object.freeze({
  // A year-month contributes to the seasonal baseline only if it is a completed month,
  // all eligible readings are provider-qualified and they support >= 90% of the month.
  minMonthSupport: 0.9,
  // Fewer comparable years than this and percentile / "typical" labels are withheld.
  minReferenceYears: 5,
  // Day-of-year band smoothing: +/- days around each calendar day.
  dayWindow: 7,
});

export function supportTier(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return SUPPORT_TIERS.NONE;
  if (ratio >= SUPPORT_RATIO.full) return SUPPORT_TIERS.FULL;
  if (ratio >= SUPPORT_RATIO.partial) return SUPPORT_TIERS.PARTIAL;
  return SUPPORT_TIERS.LIMITED;
}

export const MONTH_NAMES = Object.freeze([
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]);
