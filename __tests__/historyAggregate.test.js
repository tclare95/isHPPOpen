/** @jest-environment node */
import { baselineEligibility, buildDayOfYearBand, buildOverview, combineCoverage, combineSummaries } from "../libs/history/aggregate";
import { buildPeriodDigest } from "../libs/history/digest";
import { monthBounds } from "../libs/history/ukCalendar";
import {
  describeSupport, formatDuration, formatPercent, percentileRank, seasonalPosition, describeYears,
} from "../libs/history/present";

const MIN = 60000;
const GOOD = JSON.stringify({ quality: "Good" });
const ASOF = Date.parse("2026-11-05T12:00:00Z");

function monthDigest(year, month, value, { quality = GOOD, keep = () => true, asOf = ASOF } = {}) {
  const { from, to } = monthBounds(year, month);
  const rows = [];
  for (let t = from - 30 * MIN; t < Math.min(to + 30 * MIN, asOf); t += 15 * MIN) {
    if (keep(t, from, to)) rows.push({ observedAt: new Date(t).toISOString(), value: typeof value === "function" ? value(t, from) : value, quality });
  }
  return buildPeriodDigest(rows, { from, to, asOf });
}

describe("baseline eligibility", () => {
  test("only completed, fully qualified, well supported months qualify", () => {
    expect(baselineEligibility(monthDigest(2024, 11, 1.2))).toBe("eligible");
    expect(baselineEligibility(monthDigest(2024, 11, 1.2, { quality: null }))).toBe("provisional");
    expect(baselineEligibility(monthDigest(2026, 11, 1.2))).toBe("in_progress");
    expect(baselineEligibility(monthDigest(2024, 11, 1.2, { keep: (t, from) => t < from + 20 * 86400000 }))).toBe("insufficient_support");
    expect(baselineEligibility(undefined)).toBe("read_failed");
  });
});

describe("overview", () => {
  // Novembers 2016–2025: the level is 2.5 m (above) for the first `n` days of year index n.
  const months = [];
  for (let year = 2016; year <= 2026; year++) {
    months.push({ year, month: 11, digest: monthDigest(year, 11, (t, from) => (t < from + (year - 2016) * 86400000 ? 2.5 : 1.0 + (year - 2016) / 100)) });
  }

  test("seasonal reference uses eligible past years and names them", () => {
    const overview = buildOverview(months, { currentYear: 2026 });
    const november = overview.seasonal[10];
    expect(november.available).toBe(true);
    expect(november.referenceYears).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]);
    expect(november.excludedYears).toEqual([]);
    expect(november.aboveShare).toBeCloseTo(45 / 300, 2);
    expect(november.quantiles).toHaveLength(101);
    expect(overview.seasonal[0]).toMatchObject({ available: false, referenceYears: [], quantiles: null, aboveShare: null });
    expect(overview.months.at(-1)).toMatchObject({ year: 2026, inProgress: true, baseline: "in_progress" });
    expect(overview.yearly).toHaveLength(11);
    expect(overview.yearly.at(-1).inProgress).toBe(true);
    expect(overview.coverage).toBe("unknown");
  });

  test("fewer than five comparable years withholds the seasonal distribution", () => {
    const sparse = months.map((item) => (item.year < 2022 ? { ...item, digest: undefined, error: "ARCHIVE_INTEGRITY" } : item));
    const overview = buildOverview(sparse, { currentYear: 2026 });
    expect(overview.seasonal[10]).toMatchObject({ available: false, quantiles: null, aboveShare: null });
    expect(overview.seasonal[10].referenceYears).toEqual([2022, 2023, 2024, 2025]);
    expect(overview.seasonal[10].excludedYears[0]).toEqual({ year: 2016, reason: "read_failed" });
    expect(overview.monthsFailed).toBe(6);
    expect(overview.months[0]).toMatchObject({ status: "read_failed", error: "ARCHIVE_INTEGRITY", summary: null });
    expect(seasonalPosition(overview.seasonal[10], 1.5)).toBeNull();
  });

  test("day-of-year band needs enough years in its window", () => {
    const band = buildDayOfYearBand(months.slice(0, 10).map(({ year, digest }) => ({ year, digest })));
    const nov15 = band[319];
    expect(nov15.years).toBe(10);
    expect(nov15.p10).not.toBeNull();
    expect(band[100]).toEqual({ years: 0, p10: null, p50: null, p90: null });
    expect(buildDayOfYearBand(months.slice(0, 4))[319].p50).toBeNull();
  });
});

test("combined summaries add elapsed, supported and unknown time", () => {
  const a = monthDigest(2024, 1, 2.5);
  const b = monthDigest(2024, 2, 1.0, { keep: (t, from) => t < from + 10 * 86400000 });
  const combined = combineSummaries([a, b]);
  expect(combined.elapsedMs).toBe(a.summary.elapsedMs + b.summary.elapsedMs);
  expect(combined.aboveMs).toBe(a.summary.aboveMs);
  expect(combined.unknownMs).toBe(b.summary.unknownMs);
  expect(combined.max.value).toBe(2.5);
  expect(combined.readings.returned).toBe(a.summary.readings.returned + b.summary.readings.returned);
  expect(combineCoverage([{ status: "complete" }, { status: "unknown" }]).status).toBe("unknown");
  expect(combineCoverage([{ status: "complete" }, { status: "partial", gaps: [{ reason: "source_outage" }] }]))
    .toEqual({ status: "partial", gaps: [{ reason: "source_outage" }] });
});

describe("presentation", () => {
  test("support tiers decide whether percentages are shown", () => {
    expect(describeSupport({ support: "full", supportRatio: 1 }).showShare).toBe(true);
    expect(describeSupport({ support: "partial", supportRatio: 0.7 })).toMatchObject({ showShare: true, tone: "partial" });
    expect(describeSupport({ support: "limited", supportRatio: 0.2 })).toMatchObject({ showShare: false, tone: "limited" });
    expect(describeSupport({ support: "none", supportRatio: 0 }).showShare).toBe(false);
  });

  test("seasonal position labels follow percentiles and never claim records", () => {
    const quantiles = Array.from({ length: 101 }, (_, p) => 1 + p / 100);
    const seasonal = { available: true, quantiles };
    expect(seasonalPosition(seasonal, 1.5)).toMatchObject({ label: "Typical", rank: 50 });
    expect(seasonalPosition(seasonal, 1.8).label).toBe("Higher than usual");
    expect(seasonalPosition(seasonal, 2.5)).toMatchObject({ label: "Much higher than usual", rank: 100 });
    expect(seasonalPosition(seasonal, 1.2).label).toBe("Lower than usual");
    expect(seasonalPosition(seasonal, 0.5).label).toBe("Much lower than usual");
    expect(percentileRank(null, 1)).toBeNull();
  });

  test("formatting", () => {
    expect(formatDuration(0)).toBe("0 h");
    expect(formatDuration(20 * MIN)).toBe("20 min");
    expect(formatDuration(5 * 60 * MIN)).toBe("5 h");
    expect(formatDuration(3 * 86400000)).toBe("3 days");
    expect(formatPercent(0.256)).toBe("26%");
    expect(formatPercent(0.012)).toBe("1.2%");
    expect(formatPercent(0.09999)).toBe("10%");
    expect(formatPercent(0.0001)).toBe("<0.1%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
    expect(describeYears([2018, 2016, 2017])).toBe("2016–2018");
    expect(describeYears([2016, 2018])).toBe("2016, 2018");
  });
});
