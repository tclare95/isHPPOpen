/** @jest-environment node */
import { buildPeriodDigest, quantilesFromHistogram, READING_FLAG } from "../libs/history/digest";
import { classifyQuality, QUALITY_CLASS } from "../libs/history/quality";
import { londonDateKey, londonDays, monthBounds, yearBounds } from "../libs/history/ukCalendar";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const GOOD = JSON.stringify({ quality: "Good" });
const EDITED = JSON.stringify({ qcode: "Edited", quality: "Good" });

const iso = (ms) => new Date(ms).toISOString();
function series(from, to, value, { step = 15 * MIN, quality = GOOD } = {}) {
  const rows = [];
  for (let t = from; t < to; t += step) {
    rows.push({ observedAt: iso(t), value: typeof value === "function" ? value(t) : value, quality, revision: 1 });
  }
  return rows;
}
// Rows for a period padded by 30 minutes, as the service reads them.
const padded = (from, to, value, options) => series(from - 30 * MIN, to + 30 * MIN, value, options);

describe("UK calendar periods", () => {
  test("GMT and BST months start at local midnight in UTC", () => {
    expect(iso(monthBounds(2024, 1).from)).toBe("2024-01-01T00:00:00.000Z");
    expect(iso(monthBounds(2024, 7).from)).toBe("2024-06-30T23:00:00.000Z");
    expect(iso(monthBounds(2024, 7).to)).toBe("2024-07-31T23:00:00.000Z");
    expect(iso(monthBounds(2024, 12).to)).toBe("2025-01-01T00:00:00.000Z");
    expect(iso(yearBounds(2025).from)).toBe("2025-01-01T00:00:00.000Z");
  });

  test("DST change days have 23 and 25 hours", () => {
    const march = londonDays(...Object.values(monthBounds(2024, 3)));
    const october = londonDays(...Object.values(monthBounds(2024, 10)));
    expect(march).toHaveLength(31);
    expect(october).toHaveLength(31);
    const len = (day) => (day.to - day.from) / HOUR;
    expect(len(march.find((day) => day.date === "2024-03-31"))).toBe(23);
    expect(len(october.find((day) => day.date === "2024-10-27"))).toBe(25);
    expect(len(october.find((day) => day.date === "2024-10-28"))).toBe(24);
  });

  test("dates are labelled in the UK calendar", () => {
    expect(londonDateKey(Date.parse("2024-06-30T23:30:00Z"))).toBe("2024-07-01");
    expect(londonDateKey(Date.parse("2024-12-31T23:30:00Z"))).toBe("2024-12-31");
  });
});

describe("quality classification", () => {
  test.each([
    [GOOD, QUALITY_CLASS.QUALIFIED, false],
    [EDITED, QUALITY_CLASS.QUALIFIED, true],
    [null, QUALITY_CLASS.PROVISIONAL, false],
    ['"Unchecked"', QUALITY_CLASS.PROVISIONAL, false],
    [JSON.stringify({ quality: "Estimated" }), QUALITY_CLASS.PROVISIONAL, false],
    ['"Good"', QUALITY_CLASS.QUALIFIED, false],
    ["Good", QUALITY_CLASS.QUALIFIED, false],
    [JSON.stringify({ quality: "Suspect" }), QUALITY_CLASS.EXCLUDED, false],
    ['"Missing"', QUALITY_CLASS.EXCLUDED, false],
    ['"Rejected"', QUALITY_CLASS.EXCLUDED, false],
    [JSON.stringify({ quality: "Mystery" }), QUALITY_CLASS.EXCLUDED, false],
    ["{not json", QUALITY_CLASS.EXCLUDED, false],
    [JSON.stringify([1]), QUALITY_CLASS.EXCLUDED, false],
    [42, QUALITY_CLASS.EXCLUDED, false],
  ])("%p is %s", (raw, cls, edited) => {
    expect(classifyQuality(raw)).toEqual({ cls, edited });
  });
});

describe("time relative to the 2.2 m rule", () => {
  const { from, to } = monthBounds(2024, 11);
  const asOf = Date.parse("2025-01-15T00:00:00Z");
  const digest = (rows, extra = {}) => buildPeriodDigest(rows, { from, to, asOf, ...extra });

  test("a fully supported month below the threshold has no unknown time", () => {
    const { summary, days } = digest(padded(from, to, 1.5));
    expect(summary.elapsedMs).toBe(30 * 24 * HOUR);
    expect(summary.belowMs).toBe(summary.elapsedMs);
    expect(summary.aboveMs).toBe(0);
    expect(summary.unknownMs).toBe(0);
    expect(summary.support).toBe("full");
    expect(summary.aboveShare).toBe(0);
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ n: 96, unknownMs: 0, min: 1.5, max: 1.5, mean: 1.5, anyAbove: false });
  });

  test("exactly 2.2 m meets the threshold", () => {
    const { summary } = digest(padded(from, to, 2.2));
    expect(summary.aboveMs).toBe(summary.elapsedMs);
    expect(summary.aboveShare).toBe(1);
    expect(summary.daysAtOrAbove).toBe(30);
  });

  test("a crossing is split at the midpoint between readings, without interpolation", () => {
    const crossing = from + 10 * 24 * HOUR;
    const rows = padded(from, to, (t) => (t < crossing ? 2.0 : 2.4));
    const { summary, days } = digest(rows);
    // Readings at crossing-15m (2.0) and crossing (2.4): 7.5 minutes each side of the midpoint.
    expect(summary.aboveMs).toBe(to - crossing + 7.5 * MIN);
    expect(summary.belowMs).toBe(crossing - from - 7.5 * MIN);
    expect(days[9].aboveMs).toBe(7.5 * MIN);
    expect(days[9].anyAbove).toBe(false);
    expect(days[10].anyAbove).toBe(true);
  });

  test("a gap longer than 30 minutes is unknown time, never below or above", () => {
    const gapFrom = from + 5 * 24 * HOUR;
    const gapTo = gapFrom + 6 * HOUR;
    const rows = padded(from, to, 1.2).filter((row) => {
      const t = Date.parse(row.observedAt);
      return t <= gapFrom || t >= gapTo;
    });
    const { summary } = digest(rows);
    expect(summary.unknownMs).toBe(6 * HOUR);
    expect(summary.belowMs + summary.aboveMs + summary.unknownMs).toBe(summary.elapsedMs);
    expect(summary.largestGapMs).toBe(6 * HOUR);
    expect(summary.support).toBe("full"); // 99.2% supported
  });

  test("a 30-minute interval is supported but a 31-minute one is not", () => {
    const base = from + 30 * HOUR; // 06:00 on day two
    const rows = [
      ...series(from - 30 * MIN, base + MIN, 1), // ... up to and including base
      { observedAt: iso(base + 30 * MIN), value: 1, quality: GOOD }, // 30 min later: supported
      ...series(base + 61 * MIN, to + 30 * MIN, 1), // 31 min later: unknown
    ];
    const { days, summary } = digest(rows);
    expect(days[1].unknownMs).toBe(31 * MIN);
    expect(days[1].belowMs).toBe(24 * HOUR - 31 * MIN);
    expect(summary.unknownMs).toBe(31 * MIN);
  });

  test("variable cadence is weighted by elapsed time, not by sample count", () => {
    const start = from - 30 * MIN;
    const rows = [];
    for (let t = start; t < from + 2 * HOUR; t += 5 * MIN) rows.push({ observedAt: iso(t), value: 2.5, quality: GOOD });
    for (let t = from + 2 * HOUR; t <= to + 30 * MIN; t += 20 * MIN) rows.push({ observedAt: iso(t), value: 1.0, quality: GOOD });
    const { summary } = digest(rows);
    expect(summary.aboveMs).toBe(2 * HOUR - 2.5 * MIN);
    expect(summary.unknownMs).toBe(0);
  });

  test("excluded readings become gaps and are counted, never used as levels", () => {
    const suspect = JSON.stringify({ quality: "Suspect" });
    const rows = padded(from, to, 1.0).map((row, index) => (index > 100 && index < 110 ? { ...row, value: 9.9, quality: suspect } : row));
    const { summary } = digest(rows);
    expect(summary.readings.excluded).toBe(9);
    expect(summary.max.value).toBe(1.0);
    expect(summary.aboveMs).toBe(0);
    expect(summary.unknownMs).toBe(150 * MIN); // 9 excluded readings leave a 150-minute gap
  });

  test("time before the first reading and after the last is unknown", () => {
    const rows = series(from + 2 * HOUR, to - 3 * HOUR, 1.0);
    const { summary } = digest(rows);
    expect(summary.unknownMs).toBe(2 * HOUR + 3 * HOUR + 15 * MIN);
  });

  test("an empty period has no support and no percentage", () => {
    const { summary, days } = digest([]);
    expect(summary).toMatchObject({ supportedMs: 0, support: "none", aboveShare: null, median: null, max: null, daysWithData: 0 });
    expect(days.every((day) => day.mean === null)).toBe(true);
  });

  test("an in-progress month counts only elapsed time", () => {
    const now = from + 4 * 24 * HOUR + 6 * HOUR;
    const rows = series(from - 30 * MIN, now - 10 * MIN, 1.0);
    const result = buildPeriodDigest(rows, { from, to, asOf: now });
    expect(result.period.inProgress).toBe(true);
    expect(result.summary.elapsedMs).toBe(now - from);
    expect(result.summary.unknownMs).toBe(15 * MIN); // latest reading 15 minutes before now
    expect(result.days[4].elapsedMs).toBe(6 * HOUR);
    expect(result.days[5].elapsedMs).toBe(0);
  });

  test("DST days sum to their real length", () => {
    const october = monthBounds(2024, 10);
    const result = buildPeriodDigest(padded(october.from, october.to, 1.0), { ...october, asOf });
    const day = result.days.find((item) => item.date === "2024-10-27");
    expect(day.n).toBe(100);
    expect(day.belowMs).toBe(25 * HOUR);
    expect(result.summary.elapsedMs).toBe((31 * 24 + 1) * HOUR);
  });

  test("quality, edits, revisions and provisional readings are counted and flagged", () => {
    const rows = padded(from, to, 1.0).map((row, index) => {
      if (index === 10) return { ...row, quality: EDITED, revision: 2 };
      if (index === 20) return { ...row, quality: null };
      return row;
    });
    const result = digest(rows);
    expect(result.summary.readings).toEqual({ returned: 2880, qualified: 2879, provisional: 1, excluded: 0, edited: 1, revised: 1 });
    expect(result.readings[8][2]).toBe(READING_FLAG.EDITED);
    expect(result.readings[18][2]).toBe(READING_FLAG.PROVISIONAL);
    expect(result.histograms.provisional).toEqual({ 100: 1 });
  });

  test("RDP coverage evidence is clipped and never upgraded", () => {
    const result = digest([], { coverage: { status: "partial", gaps: [{ from: "2024-10-01T00:00:00Z", to: "2024-11-02T00:00:00Z", reason: "source_outage" }, { from: "x", to: "y", reason: "unknown" }] } });
    expect(result.coverage).toEqual({ status: "partial", gaps: [{ from: "2024-11-01T00:00:00.000Z", to: "2024-11-02T00:00:00.000Z", reason: "source_outage" }] });
    expect(digest([], { coverage: { status: "invented" } }).coverage.status).toBe("unknown");
  });
});

test("quantiles come from 1 cm histograms", () => {
  const histogram = {};
  for (let cm = 100; cm < 200; cm++) histogram[cm] = 1;
  const q = quantilesFromHistogram(histogram);
  expect(q).toHaveLength(101);
  expect(q[0]).toBe(1);
  expect(q[50]).toBe(1.49);
  expect(q[100]).toBe(1.99);
  expect(quantilesFromHistogram({})).toBeNull();
});
