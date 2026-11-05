// Pure composition of month digests into year views, year-on-year comparison and
// seasonal context (#104). Every figure keeps its denominator and contributing years.
import { SEASONAL_RULES, supportTier } from "./config.js";
import { histogramCount, mergeHistograms, quantilesFromHistogram } from "./digest.js";

const COVERAGE_RANK = { complete: 0, partial: 1, unknown: 2 };

export function combineCoverage(coverages) {
  const statuses = coverages.map((coverage) => coverage?.status ?? "unknown");
  const status = statuses.reduce((worst, item) => (COVERAGE_RANK[item] > COVERAGE_RANK[worst] ? item : worst), "complete");
  return { status: statuses.length ? status : "unknown", gaps: coverages.flatMap((coverage) => coverage?.gaps ?? []) };
}

// Merges summaries of consecutive periods. Medians come from merged 1 cm histograms.
export function combineSummaries(digests) {
  const sum = (pick) => digests.reduce((total, digest) => total + pick(digest.summary), 0);
  const elapsedMs = sum((s) => s.elapsedMs);
  const aboveMs = sum((s) => s.aboveMs);
  const belowMs = sum((s) => s.belowMs);
  const supportedMs = aboveMs + belowMs;
  const supportRatio = elapsedMs > 0 ? supportedMs / elapsedMs : null;
  const extreme = (key, better) => digests.map((digest) => digest.summary[key]).filter(Boolean)
    .reduce((best, item) => (!best || better(item.value, best.value) ? item : best), null);
  const histogram = digests.reduce((target, digest) =>
    mergeHistograms(mergeHistograms(target, digest.histograms?.qualified), digest.histograms?.provisional), {});
  const quantiles = quantilesFromHistogram(histogram);
  const readings = {};
  for (const digest of digests) {
    for (const [key, value] of Object.entries(digest.summary.readings)) readings[key] = (readings[key] ?? 0) + value;
  }
  return {
    elapsedMs, supportedMs, aboveMs, belowMs, unknownMs: Math.max(0, elapsedMs - supportedMs),
    supportRatio, support: supportTier(supportRatio),
    aboveShare: supportedMs > 0 ? aboveMs / supportedMs : null,
    min: extreme("min", (a, b) => a < b), max: extreme("max", (a, b) => a > b),
    median: quantiles ? quantiles[50] : null,
    daysAtOrAbove: sum((s) => s.daysAtOrAbove), daysWithData: sum((s) => s.daysWithData),
    largestGapMs: Math.max(0, ...digests.map((digest) => digest.summary.largestGapMs)),
    readings,
  };
}

// Why a year-month can or cannot serve as seasonal reference evidence.
export function baselineEligibility(digest) {
  if (!digest) return "read_failed";
  if (digest.period.inProgress) return "in_progress";
  if (digest.summary.readings.provisional > 0) return "provisional";
  if (!(digest.summary.supportRatio >= SEASONAL_RULES.minMonthSupport)) return "insufficient_support";
  return "eligible";
}

const quantileOf = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];

// Leap-year day index (0..365) so 29 Feb has its own slot and 1 March is always 60.
export function dayOfYearIndex(date) {
  const [, month, day] = date.split("-").map(Number);
  return Math.round((Date.UTC(2024, month - 1, day) - Date.UTC(2024, 0, 1)) / 86400000);
}

export function buildDayOfYearBand(entries) {
  const byIndex = Array.from({ length: 366 }, () => []);
  for (const { year, digest } of entries) {
    for (const day of digest.days) {
      if (day.mean !== null && day.elapsedMs > 0 && day.unknownMs <= day.elapsedMs * (1 - SEASONAL_RULES.minMonthSupport)) {
        byIndex[dayOfYearIndex(day.date)].push({ year, mean: day.mean });
      }
    }
  }
  return byIndex.map((_, index) => {
    const window = [];
    for (let offset = -SEASONAL_RULES.dayWindow; offset <= SEASONAL_RULES.dayWindow; offset++) {
      window.push(...byIndex[(index + offset + 366) % 366]);
    }
    const years = new Set(window.map((item) => item.year)).size;
    if (years < SEASONAL_RULES.minReferenceYears) return { years, p10: null, p50: null, p90: null };
    const sorted = window.map((item) => item.mean).sort((a, b) => a - b);
    return { years, p10: quantileOf(sorted, 0.1), p50: quantileOf(sorted, 0.5), p90: quantileOf(sorted, 0.9) };
  });
}

const stripSummary = (summary) => ({ ...summary });

/**
 * @param {Array<{year:number, month:number, digest?:object, error?:string}>} months chronological
 * @param {{currentYear:number}} context
 */
export function buildOverview(months, { currentYear }) {
  const monthRows = months.map(({ year, month, digest, error }) => ({
    year, month,
    status: digest ? "available" : "read_failed",
    error: error ?? null,
    inProgress: Boolean(digest?.period.inProgress),
    baseline: baselineEligibility(digest),
    coverage: digest?.coverage.status ?? null,
    summary: digest ? stripSummary(digest.summary) : null,
  }));

  const years = [...new Set(months.map((item) => item.year))];
  const yearly = years.map((year) => {
    const entries = months.filter((item) => item.year === year);
    const available = entries.filter((item) => item.digest);
    return {
      year,
      inProgress: entries.some((item) => item.digest?.period.inProgress) || entries.length < 12,
      monthsFailed: entries.length - available.length,
      coverage: combineCoverage(available.map((item) => item.digest.coverage)).status,
      summary: available.length ? combineSummaries(available.map((item) => item.digest)) : null,
    };
  });

  const reference = months.filter((item) => item.year < currentYear && baselineEligibility(item.digest) === "eligible");
  const seasonal = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const contributing = reference.filter((item) => item.month === month);
    const considered = months.filter((item) => item.month === month && item.year < currentYear);
    const histogram = contributing.reduce((target, item) => mergeHistograms(target, item.digest.histograms.qualified), {});
    const quantiles = quantilesFromHistogram(histogram);
    const aboveMs = contributing.reduce((total, item) => total + item.digest.summary.aboveMs, 0);
    const supportedMs = contributing.reduce((total, item) => total + item.digest.summary.supportedMs, 0);
    const available = contributing.length >= SEASONAL_RULES.minReferenceYears && Boolean(quantiles);
    return {
      month,
      available,
      referenceYears: contributing.map((item) => item.year),
      excludedYears: considered.filter((item) => !contributing.includes(item))
        .map((item) => ({ year: item.year, reason: baselineEligibility(item.digest) })),
      readingCount: histogramCount(histogram),
      quantiles: available ? quantiles : null,
      aboveShare: available && supportedMs > 0 ? aboveMs / supportedMs : null,
      aboveMs, supportedMs,
    };
  });

  return {
    months: monthRows,
    yearly,
    seasonal,
    dayOfYear: buildDayOfYearBand(reference),
    coverage: combineCoverage(months.filter((item) => item.digest).map((item) => item.digest.coverage)).status,
    monthsFailed: monthRows.filter((row) => row.status === "read_failed").length,
  };
}
