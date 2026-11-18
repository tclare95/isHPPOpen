import { countGrid, findGaps, summariseGauge, summariseWindow, sumMm } from "../libs/rainfall/observedRainfall";
import { describeLatest, describeWindow, formatMm, RAINFALL_DELAYED_AFTER_MS } from "../libs/rainfall/present";

const PERIOD = 15 * 60000;
const HOUR = 3600000;
const END = Date.UTC(2026, 10, 18, 11, 45);

// Parsed intervals as libs/rdp/rainfallContract.js returns them.
function interval(labelMs, totalMm, { convention = "unverified", eligible = true, revision = 1 } = {}) {
  const start = convention === "period_end" ? labelMs - PERIOD : labelMs;
  const verified = convention !== "unverified";
  return {
    label: new Date(labelMs).toISOString(), labelMs, labelConvention: convention,
    periodStart: verified ? new Date(start).toISOString() : null, periodEnd: verified ? new Date(start + PERIOD).toISOString() : null,
    totalMm: eligible ? totalMm : null, eligible, revision,
  };
}
// `hours` of consecutive labels ending at `end`, with per-label overrides.
function series(hours, end, value = 0, overrides = {}) {
  const rows = [];
  for (let i = hours * 4 - 1; i >= 0; i--) {
    const label = end - i * PERIOD;
    if (overrides[label] === "absent") continue;
    rows.push(overrides[label] ?? interval(label, value));
  }
  return rows;
}

describe("accumulation windows", () => {
  it("states a total only when every interval in the window is reported and eligible", () => {
    const rows = series(6, END, 0, { [END]: interval(END, 1.2), [END - PERIOD]: interval(END - PERIOD, 0.4) });
    expect(summariseWindow(rows, END, 6)).toMatchObject({ expected: 24, reported: 24, missing: 0, status: "complete", totalMm: 1.6, reportedMm: 1.6 });
  });

  it("treats four eligible zeroes as a complete 0 mm but absent intervals as unknown, never zero", () => {
    expect(summariseWindow(series(1, END, 0), END, 1)).toMatchObject({ status: "complete", totalMm: 0 });
    const withGap = series(1, END, 0, { [END - PERIOD]: "absent" });
    expect(summariseWindow(withGap, END, 1)).toMatchObject({ status: "incomplete", totalMm: null, reportedMm: 0, missing: 1, expected: 4 });
    expect(summariseWindow([], END, 1)).toMatchObject({ status: "empty", totalMm: null, reportedMm: null, missing: 4 });
  });

  it("gives a lower bound for a partial window and excludes ineligible depths from it (RDP's [0.4, Missing, absent, 0] example)", () => {
    const rows = [interval(END - 3 * PERIOD, 0.4), interval(END - 2 * PERIOD, 9, { eligible: false }), interval(END, 0)];
    const window = summariseWindow(rows, END, 1);
    expect(window).toMatchObject({ status: "incomplete", totalMm: null, reportedMm: 0.4, missing: 2, ineligible: 1 });
    expect(describeWindow(window)).toEqual({ headline: "at least 0.4 mm", detail: "2 of 4 intervals missing", state: "incomplete" });
  });

  it("offers physical start/end only for a complete window whose labels all share a verified convention", () => {
    const verified = series(1, END, 0.2, Object.fromEntries([0, 1, 2, 3].map((i) => [END - i * PERIOD, interval(END - i * PERIOD, 0.2, { convention: "period_end" })])));
    expect(summariseWindow(verified, END, 1)).toMatchObject({
      labelConvention: "period_end", periodStart: new Date(END - 4 * PERIOD).toISOString(), periodEnd: new Date(END).toISOString(), totalMm: 0.8,
    });
    const mixed = series(1, END, 0.2, { [END]: interval(END, 0.2, { convention: "period_end" }) });
    expect(summariseWindow(mixed, END, 1)).toMatchObject({ labelConvention: "mixed", periodStart: null, periodEnd: null, status: "complete" });
    expect(summariseWindow(series(1, END, 0.2), END, 1)).toMatchObject({ labelConvention: "unverified", periodStart: null });
    const partialVerified = series(1, END, 0.2, { [END]: "absent" }).map((row) => interval(row.labelMs, 0.2, { convention: "period_end" }));
    expect(summariseWindow(partialVerified, END, 1)).toMatchObject({ status: "incomplete", periodStart: null });
  });

  it("adds 0.1/0.2/0.01 mm steps without floating-point drift", () => {
    expect(sumMm([0.1, 0.2])).toBe(0.3);
    expect(sumMm(Array(10).fill(0.01))).toBe(0.1);
  });

  it("counts the expected grid exactly like RDP's window", () => {
    const rows = series(2, END, 0, { [END - PERIOD]: "absent", [END]: interval(END, 0, { eligible: false }) });
    expect(countGrid(rows, END - 2 * HOUR + PERIOD, END + PERIOD)).toEqual({ expected: 8, reported: 7, eligible: 6, absent: 1, ineligible: 1 });
  });
});

describe("gauge summary", () => {
  const fromMs = END + PERIOD - 78 * HOUR;
  const options = (toMs) => ({ fromMs, toMs, windowHours: [6, 24, 72], maxAnchorLagMs: 6 * HOUR });

  it("ends windows at the newest report and calls the undelivered tail pending, not missing", () => {
    const toMs = END + 5 * PERIOD; // four labels after END are not delivered yet (normal EA lag)
    const rows = series(78, END, 0);
    const gauge = summariseGauge(rows, { ...options(toMs), fromMs: toMs - 78 * HOUR });
    expect(gauge).toMatchObject({ latestReportedLabel: new Date(END).toISOString(), windowsEndAtLatestReport: true, pending: 4 });
    expect(gauge.windows.map((w) => w.status)).toEqual(["complete", "complete", "complete"]);
  });

  it("when nothing arrives for over six hours, ends windows now so the silence counts as missing", () => {
    const toMs = END + PERIOD + 7 * HOUR;
    const gauge = summariseGauge(series(70, END, 0.2), { ...options(toMs), fromMs: toMs - 78 * HOUR });
    expect(gauge.windowsEndAtLatestReport).toBe(false);
    expect(gauge.pending).toBe(0);
    expect(gauge.windows[0]).toMatchObject({ hours: 6, status: "empty", missing: 24 });
    expect(gauge.windows[1]).toMatchObject({ hours: 24, status: "incomplete", missing: 28 });
    expect(gauge.gaps.at(-1)).toMatchObject({ reason: "absent", intervals: 28 });
  });

  it("merges gap runs by reason and marks revised intervals", () => {
    const rows = series(2, END, 0, {
      [END - 4 * PERIOD]: "absent", [END - 3 * PERIOD]: "absent",
      [END - 2 * PERIOD]: interval(END - 2 * PERIOD, 0, { eligible: false }),
      [END]: interval(END, 0.4, { revision: 2 }),
    });
    expect(findGaps(rows, END - 2 * HOUR + PERIOD, END)).toEqual([
      { fromLabel: new Date(END - 4 * PERIOD).toISOString(), toLabel: new Date(END - 3 * PERIOD).toISOString(), intervals: 2, reason: "absent" },
      { fromLabel: new Date(END - 2 * PERIOD).toISOString(), toLabel: new Date(END - 2 * PERIOD).toISOString(), intervals: 1, reason: "ineligible" },
    ]);
    const gauge = summariseGauge(rows, options(END + PERIOD));
    expect(gauge.revised).toBe(1);
    expect(gauge.intervals.at(-1)).toMatchObject({ totalMm: 0.4, revised: true });
    expect(gauge.intervals.find((row) => !row.eligible)).toMatchObject({ totalMm: null });
  });

  it("reports an empty gauge without inventing a latest label", () => {
    const gauge = summariseGauge([], options(END + PERIOD));
    expect(gauge).toMatchObject({ latestReportedLabel: null, windowsEndAtLatestReport: false });
    expect(gauge.windows.every((w) => w.status === "empty" && w.totalMm === null)).toBe(true);
  });
});

describe("presentation", () => {
  it("formats millimetres to the gauge resolution", () => {
    expect([formatMm(0), formatMm(0.2), formatMm(0.04), formatMm(12.34), formatMm(null)]).toEqual(["0.0 mm", "0.2 mm", "0.04 mm", "12.3 mm", "–"]);
  });

  it("describes complete, verified and empty windows honestly", () => {
    expect(describeWindow({ status: "complete", totalMm: 3.2, expected: 96, periodStart: null })).toMatchObject({ headline: "3.2 mm", detail: "All 96 intervals reported" });
    expect(describeWindow({ status: "complete", totalMm: 0, expected: 4, periodStart: "2026-11-18T10:00:00Z", periodEnd: "2026-11-18T11:00:00Z" }).detail)
      .toBe("All 4 intervals, Wed 10:00–11:00");
    expect(describeWindow({ status: "empty", expected: 24 })).toMatchObject({ headline: "No reports", detail: "None of 24 intervals reported" });
    expect(describeWindow(null).state).toBe("unavailable");
  });

  it("measures lag from the label, calling the usual EA delay usual and longer silence delayed", () => {
    const label = "2026-11-18T11:45:00.000Z";
    const at = (ms) => describeLatest({ latestReportedLabel: label }, Date.parse(label) + ms);
    expect(at(50 * 60000)).toEqual({ text: "Label Wed 11:45 · 50 min ago", state: "usual" });
    expect(at(RAINFALL_DELAYED_AFTER_MS + 60000).state).toBe("delayed");
    expect(describeLatest({ latestReportedLabel: null, latest: null })).toEqual({ text: "No recent reports", state: "none" });
  });
});
