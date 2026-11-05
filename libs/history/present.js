// Client-safe formatting and interpretation of history payloads (#104).
import { COLWICK_HISTORY, MONTH_NAMES, SUPPORT_TIERS } from "./config.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0 h";
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < 2 * DAY_MS) return `${Math.round(ms / HOUR_MS)} h`;
  return `${(ms / DAY_MS).toFixed(1).replace(/\.0$/, "")} days`;
}

export function formatPercent(share) {
  if (!Number.isFinite(share)) return "—";
  const percent = share * 100;
  if (percent === 0) return "0%";
  if (percent > 0 && percent < 0.1) return "<0.1%";
  return percent < 9.95 ? `${percent.toFixed(1)}%` : `${Math.round(percent)}%`;
}

export function formatLevel(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} m` : "—";
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: COLWICK_HISTORY.timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (value) => (value === null || value === undefined ? "—" : DATE_TIME.format(new Date(value)));
export const formatDate = (value) => (value === null || value === undefined ? "—" : DATE.format(new Date(value)));
// "YYYY-MM-DD" UK calendar day → label, without timezone drift.
export function formatDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export const monthName = (month) => MONTH_NAMES[month - 1];
export const shortMonthName = (month) => MONTH_NAMES[month - 1].slice(0, 3);

// Whether a percentage of supported time may be shown, and how to qualify it.
export function describeSupport(summary) {
  if (!summary || summary.support === SUPPORT_TIERS.NONE) {
    return { showShare: false, tone: "none", text: "No supported observations for this period." };
  }
  const covered = formatPercent(summary.supportRatio);
  if (summary.support === SUPPORT_TIERS.FULL) {
    return { showShare: true, tone: "full", text: `Observations support ${covered} of the elapsed period.` };
  }
  if (summary.support === SUPPORT_TIERS.PARTIAL) {
    return { showShare: true, tone: "partial", text: `Observations support only ${covered} of the elapsed period; percentages describe that supported time, not the whole period.` };
  }
  return { showShare: false, tone: "limited", text: `Observations support only ${covered} of the elapsed period, too little for a meaningful percentage.` };
}

// Mid-rank of a value among p1..p99 quantiles (0–100), or null without a distribution.
export function percentileRank(quantiles, value) {
  if (!Array.isArray(quantiles) || quantiles.length !== 101 || !Number.isFinite(value)) return null;
  const inner = quantiles.slice(1, 100);
  const below = inner.filter((q) => q < value).length;
  const equal = inner.filter((q) => q === value).length;
  return Math.round(((below + equal / 2) / inner.length) * 100);
}

// Seasonal position labels; withheld (null) when the baseline is not available.
export function seasonalPosition(seasonal, value) {
  if (!seasonal?.available || !Number.isFinite(value)) return null;
  const q = seasonal.quantiles;
  const rank = percentileRank(q, value);
  let label = "Typical";
  let tone = "typical";
  if (value < q[10]) { label = "Much lower than usual"; tone = "low"; }
  else if (value < q[25]) { label = "Lower than usual"; tone = "low"; }
  else if (value > q[90]) { label = "Much higher than usual"; tone = "high"; }
  else if (value > q[75]) { label = "Higher than usual"; tone = "high"; }
  return { rank, label, tone, p10: q[10], p25: q[25], p50: q[50], p75: q[75], p90: q[90], min: q[0], max: q[100] };
}

export function describeYears(years) {
  if (!years?.length) return "no reference years";
  const sorted = [...years].sort((a, b) => a - b);
  const contiguous = sorted.every((year, index) => index === 0 || year === sorted[index - 1] + 1);
  return contiguous && sorted.length > 1 ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(", ");
}

const BASELINE_REASONS = {
  in_progress: "month not finished",
  provisional: "provisional readings",
  insufficient_support: "too few supported observations",
  read_failed: "could not be read",
};
export const baselineReasonText = (reason) => BASELINE_REASONS[reason] ?? reason;

export const COVERAGE_TEXT = {
  complete: "RDP's reviewed coverage inventory marks this period complete.",
  partial: "RDP's reviewed coverage inventory lists known gaps in this period.",
  unknown: "RDP has not yet published a reviewed coverage inventory for this period, so completeness is not formally confirmed.",
};
