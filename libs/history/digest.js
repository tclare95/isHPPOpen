// Pure evidence-aware summaries of one UK calendar period of Colwick observations (#104).
//
// Elapsed-time policy ("nearest supported reading"):
// - Readings are instantaneous samples. Between two consecutive eligible readings at most
//   `maxSupportedGapMs` apart, the first half of the interval takes the earlier reading's
//   state and the second half the later one's. Same-side pairs therefore attribute the
//   whole interval; a threshold crossing is split at the midpoint, with no interpolated level.
// - Longer gaps, excluded readings, time before the first / after the last reading and
//   undeclared coverage are unknown time: never below, never above.
// - Time after `asOf` has not elapsed and is outside the denominator.
// Callers pass rows from a window padded by `maxSupportedGapMs` on both sides so the
// period edges are attributed exactly as they would be inside a longer read.
import { COLWICK_HISTORY, supportTier } from "./config.js";
import { classifyQuality, QUALITY_CLASS } from "./quality.js";
import { londonDays } from "./ukCalendar.js";

// Compact reading flags sent to the browser.
export const READING_FLAG = Object.freeze({ QUALIFIED: 0, PROVISIONAL: 1, EDITED: 2 });

const atOrAbove = (value, threshold) => Math.round(value * 1000) >= Math.round(threshold * 1000);
const round3 = (value) => Math.round(value * 1000) / 1000;

export function histogramAdd(histogram, value, count = 1) {
  const key = Math.round(value * 100);
  histogram[key] = (histogram[key] ?? 0) + count;
}

export function mergeHistograms(target, source) {
  for (const [key, count] of Object.entries(source ?? {})) target[key] = (target[key] ?? 0) + count;
  return target;
}

export function histogramCount(histogram) {
  return Object.values(histogram ?? {}).reduce((sum, count) => sum + count, 0);
}

// 101 quantiles (p0..p100) in metres at 1 cm resolution; null when empty.
export function quantilesFromHistogram(histogram) {
  const bins = Object.entries(histogram ?? {}).map(([key, count]) => [Number(key), count]).sort((a, b) => a[0] - b[0]);
  const total = bins.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return null;
  const quantiles = [];
  let index = 0;
  let cumulative = bins[0][1];
  for (let p = 0; p <= 100; p++) {
    const rank = Math.max(1, Math.ceil((p / 100) * total));
    while (cumulative < rank && index < bins.length - 1) cumulative += bins[++index][1];
    quantiles.push(bins[index][0] / 100);
  }
  return quantiles;
}

function emptyCounts() {
  return { returned: 0, qualified: 0, provisional: 0, excluded: 0, edited: 0, revised: 0 };
}

function normaliseCoverage(coverage, from, to) {
  const status = ["complete", "partial", "unknown"].includes(coverage?.status) ? coverage.status : "unknown";
  const gaps = (Array.isArray(coverage?.gaps) ? coverage.gaps : [])
    .map((gap) => ({ from: Math.max(Date.parse(gap?.from), from), to: Math.min(Date.parse(gap?.to), to), reason: gap?.reason }))
    .filter((gap) => Number.isFinite(gap.from) && Number.isFinite(gap.to) && gap.to > gap.from &&
      ["not_collected", "legacy_unrecoverable", "source_outage", "unknown"].includes(gap.reason))
    .map((gap) => ({ from: new Date(gap.from).toISOString(), to: new Date(gap.to).toISOString(), reason: gap.reason }));
  return { status, gaps };
}

/**
 * @param {Array} rows chronological RDP observation rows (padded window)
 * @param {{from:number,to:number,asOf:number,coverage?:object,threshold?:number,maxGapMs?:number}} period
 */
export function buildPeriodDigest(rows, { from, to, asOf, coverage, threshold = COLWICK_HISTORY.thresholdMetres,
  maxGapMs = COLWICK_HISTORY.maxSupportedGapMs }) {
  const end = Math.max(from, Math.min(to, asOf));
  const counts = emptyCounts();
  const eligible = [];

  for (const row of rows) {
    const t = Date.parse(row.observedAt);
    const { cls, edited } = classifyQuality(row.quality);
    const inPeriod = t >= from && t < end;
    if (inPeriod) {
      counts.returned++;
      counts[cls]++;
      if (edited) counts.edited++;
      if (Number(row.revision) > 1) counts.revised++;
    }
    if (cls !== QUALITY_CLASS.EXCLUDED && t < end + maxGapMs) {
      eligible.push({ t, v: row.value, provisional: cls === QUALITY_CLASS.PROVISIONAL, edited, inPeriod });
    }
  }

  const days = londonDays(from, to).map((day) => ({
    date: day.date, from: day.from, to: day.to,
    elapsedMs: Math.max(0, Math.min(day.to, end) - Math.max(day.from, from)),
    aboveMs: 0, belowMs: 0, n: 0, provisional: 0, min: null, max: null, sum: 0, anyAbove: false,
  }));
  const totals = { aboveMs: 0, belowMs: 0 };

  let dayIndex = 0;
  const allocate = (start, stop, above) => {
    let s = Math.max(start, from);
    const e = Math.min(stop, end);
    if (e <= s) return;
    const key = above ? "aboveMs" : "belowMs";
    totals[key] += e - s;
    while (dayIndex > 0 && days[dayIndex].from > s) dayIndex--;
    while (s < e) {
      while (days[dayIndex].to <= s) dayIndex++;
      const piece = Math.min(e, days[dayIndex].to) - s;
      days[dayIndex][key] += piece;
      s += piece;
    }
  };

  const histograms = { qualified: {}, provisional: {} };
  const values = [];
  const readings = [];
  let minimum = null;
  let maximum = null;
  let largestGapMs = 0;
  let previousInPeriod = from;
  let readingDay = 0;

  for (let i = 0; i < eligible.length; i++) {
    const point = eligible[i];
    const above = atOrAbove(point.v, threshold);
    const next = eligible[i + 1];
    if (next && next.t - point.t <= maxGapMs) {
      const mid = point.t + (next.t - point.t) / 2;
      allocate(point.t, mid, above);
      allocate(mid, next.t, atOrAbove(next.v, threshold));
    }
    if (!point.inPeriod) continue;

    while (days[readingDay].to <= point.t) readingDay++;
    const day = days[readingDay];
    day.n++;
    day.sum += point.v;
    if (point.provisional) day.provisional++;
    if (day.min === null || point.v < day.min) day.min = point.v;
    if (day.max === null || point.v > day.max) day.max = point.v;
    if (above) day.anyAbove = true;

    histogramAdd(point.provisional ? histograms.provisional : histograms.qualified, point.v);
    values.push(point.v);
    if (!minimum || point.v < minimum.value) minimum = { value: point.v, at: point.t };
    if (!maximum || point.v > maximum.value) maximum = { value: point.v, at: point.t };
    largestGapMs = Math.max(largestGapMs, point.t - previousInPeriod);
    previousInPeriod = point.t;
    readings.push([Math.round(point.t / 1000), point.v,
      point.provisional ? READING_FLAG.PROVISIONAL : point.edited ? READING_FLAG.EDITED : READING_FLAG.QUALIFIED]);
  }
  if (end > from) largestGapMs = Math.max(largestGapMs, end - previousInPeriod);

  values.sort((a, b) => a - b);
  const elapsedMs = end - from;
  const supportedMs = totals.aboveMs + totals.belowMs;
  const supportRatio = elapsedMs > 0 ? supportedMs / elapsedMs : null;

  const summary = {
    elapsedMs, supportedMs, aboveMs: totals.aboveMs, belowMs: totals.belowMs,
    unknownMs: Math.max(0, elapsedMs - supportedMs),
    supportRatio, support: supportTier(supportRatio),
    aboveShare: supportedMs > 0 ? totals.aboveMs / supportedMs : null,
    min: minimum && { value: minimum.value, at: new Date(minimum.at).toISOString() },
    max: maximum && { value: maximum.value, at: new Date(maximum.at).toISOString() },
    median: values.length ? round3(values[Math.floor((values.length - 1) / 2)]) : null,
    daysAtOrAbove: days.filter((day) => day.anyAbove).length,
    daysWithData: days.filter((day) => day.n > 0).length,
    largestGapMs,
    readings: counts,
  };

  return {
    period: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), end: new Date(end).toISOString(), inProgress: asOf < to },
    coverage: normaliseCoverage(coverage, from, to),
    summary,
    days: days.map((day) => ({
      date: day.date, elapsedMs: day.elapsedMs, aboveMs: day.aboveMs, belowMs: day.belowMs,
      unknownMs: Math.max(0, day.elapsedMs - day.aboveMs - day.belowMs),
      n: day.n, provisional: day.provisional, anyAbove: day.anyAbove,
      min: day.min, max: day.max, mean: day.n ? round3(day.sum / day.n) : null,
    })),
    histograms,
    readings,
  };
}
