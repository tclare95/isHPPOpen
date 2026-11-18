import { fireEvent, render, screen, within } from "@testing-library/react";
import useFetch from "../libs/useFetch";
import ObservedRainfall, { colwickLevelPoints } from "../components/functional/observedRainfall";
import { levelPath } from "../components/functional/rainfallLevelChart";

jest.mock("../libs/useFetch");

const PERIOD = 15 * 60000;
const TO = Date.UTC(2026, 10, 18, 12, 45);
const LATEST = Date.UTC(2026, 10, 18, 11, 45);
const iso = (ms) => new Date(ms).toISOString();

function window(hours, overrides = {}) {
  return { hours, firstLabel: iso(LATEST - hours * 3600000 + PERIOD), lastLabel: iso(LATEST), expected: hours * 4, reported: hours * 4,
    missing: 0, ineligible: 0, status: "complete", totalMm: 1.2, reportedMm: 1.2, labelConvention: "unverified", periodStart: null, periodEnd: null, ...overrides };
}

function gauge(id, name, overrides = {}) {
  return {
    measurementId: id, name, reference: "3014", area: "Upper Trent, Staffordshire", unit: "mm", periodMinutes: 15, status: "available",
    latest: { label: iso(LATEST), labelConvention: "unverified", periodStart: null, periodEnd: null, totalMm: 0.4, eligible: true, freshness: "stale" },
    latestReportedLabel: iso(LATEST), windowsEndAt: iso(LATEST), windowsEndAtLatestReport: true, pending: 3, revised: 0,
    rangeSummary: { status: "incomplete" }, rangeSummaryUnavailable: null,
    windows: [window(6), window(24), window(72)],
    gaps: [{ fromLabel: iso(LATEST - 8 * PERIOD), toLabel: iso(LATEST - 7 * PERIOD), intervals: 2, reason: "absent" }],
    intervals: [
      { label: iso(LATEST - PERIOD), labelConvention: "period_end", periodStart: iso(LATEST - 2 * PERIOD), periodEnd: iso(LATEST - PERIOD), totalMm: 0.8, eligible: true, revised: false },
      { label: iso(LATEST), labelConvention: "unverified", periodStart: null, periodEnd: null, totalMm: 0.4, eligible: true, revised: true },
    ],
    ...overrides,
  };
}

const payload = (gauges, status = "available") => ({
  generatedAt: iso(TO - 5 * 60000), status, unavailableReason: null, range: { from: iso(TO - 78 * 3600000), to: iso(TO) }, windowHours: [6, 24, 72], gauges,
});
const trent = { stations: [{ stationId: 4009, measures: { level: { readings: [
  { dateTime: iso(LATEST), value: 1.42 }, { dateTime: iso(LATEST - PERIOD), value: 1.4 },
] } } }] };

function mockFetch(rainfall, { error } = {}) {
  useFetch.mockImplementation((path) => path === "/api/trentweirs"
    ? { data: trent, error: undefined, isPending: false }
    : { data: rainfall, error, isPending: !rainfall && !error });
}

beforeEach(() => {
  jest.useFakeTimers({ now: LATEST + 50 * 60000 });
});
afterEach(() => jest.useRealTimers());

test("anchors the section for /trentweirs#rainfall and keeps observed rain distinct from the forecast", () => {
  mockFetch(payload([gauge("ea-stone-rainfall", "Stone")]));
  const { container } = render(<ObservedRainfall />);
  expect(container.querySelector("section#rainfall")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "forecast" })).toHaveAttribute("href", "/forecastinfo");
});

test("states totals only for complete windows and lower bounds with missing counts otherwise", () => {
  mockFetch(payload([gauge("ea-stone-rainfall", "Stone", {
    windows: [window(6, { status: "incomplete", totalMm: null, reportedMm: 0.6, missing: 3 }), window(24, { status: "empty", totalMm: null, reportedMm: null, reported: 0, missing: 96 }), window(72)],
  })]));
  render(<ObservedRainfall />);
  const row = screen.getByRole("row", { name: /Stone/ });
  expect(within(row).getByText("at least 0.6 mm")).toBeInTheDocument();
  expect(within(row).getByText("3 of 24 intervals missing")).toBeInTheDocument();
  expect(within(row).getByText("No reports")).toBeInTheDocument();
  expect(within(row).getByText("1.2 mm")).toBeInTheDocument();
  expect(within(row).getByText(/Label Wed 11:45 · 50 min ago/)).toBeInTheDocument();
  expect(within(row).getByText("Usual reporting delay")).toBeInTheDocument();
  expect(within(row).getByText("Label start/end not verified")).toBeInTheDocument();
});

test("lists an unavailable gauge without counting it as dry, and flags delays and revisions", () => {
  mockFetch(payload([
    gauge("ea-stone-rainfall", "Stone", { revised: 2, latestReportedLabel: iso(LATEST - 3 * 3600000), windowsEndAtLatestReport: false }),
    { measurementId: "ea-ashbourne-rainfall", name: "Ashbourne", reference: "3323", area: "Dove", status: "unavailable", unavailableReason: "not_published", latest: null },
  ], "partial"));
  render(<ObservedRainfall />);
  expect(screen.getByText(/Some rain gauges are unavailable/)).toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /Ashbourne/ })).getByText(/not published.*Not shown as zero/)).toBeInTheDocument();
  expect(screen.getByText("Delayed")).toBeInTheDocument();
  expect(screen.getByText(/Stone \(2\): some intervals were corrected/)).toBeInTheDocument();
  expect(screen.getByText(/nothing reported for over 6 hours/)).toBeInTheDocument();
  // Only the available gauge can be charted.
  expect(within(screen.getByRole("group", { name: "Rain gauge" })).getAllByRole("button")).toHaveLength(1);
});

test("draws rainfall and Colwick level in separate panels, with verified, unverified, gap and pending marks", () => {
  mockFetch(payload([gauge("ea-stone-rainfall", "Stone")]));
  render(<ObservedRainfall />);
  const bars = screen.getAllByTestId("rainfall-bar");
  expect(bars.map((bar) => bar.getAttribute("data-verified"))).toEqual(["true", "false"]);
  expect(screen.getAllByTestId("rainfall-gap")).toHaveLength(1);
  expect(screen.getByTestId("rainfall-pending")).toBeInTheDocument();
  expect(screen.getByTestId("level-line")).toBeInTheDocument();
  expect(screen.getByText("Colwick level (m)")).toBeInTheDocument();
  expect(screen.getByText(/mm per 15 min · Stone/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "72 h" }));
  expect(screen.getByRole("button", { name: "72 h" })).toHaveAttribute("aria-pressed", "true");
});

test.each([
  [{ ...payload([]), status: "unavailable", unavailableReason: "not_configured", range: null }, /not connected in this environment.*No rainfall is assumed/],
  [{ ...payload([]), status: "unavailable", unavailableReason: "not_authorised", range: null }, /not currently authorised/],
])("explains a whole-source outage instead of showing zero", (data, text) => {
  mockFetch(data);
  render(<ObservedRainfall />);
  expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("explains a failed request", () => {
  mockFetch(undefined, { error: new Error("boom") });
  render(<ObservedRainfall />);
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded. No rainfall is assumed.");
});

test("Colwick points come from the Trent feed in time order, and the level line breaks over gaps", () => {
  const points = colwickLevelPoints(trent);
  expect(points.map((p) => p.value)).toEqual([1.4, 1.42]);
  expect(colwickLevelPoints(undefined)).toEqual([]);
  const path = levelPath([{ t: 0, value: 1 }, { t: PERIOD, value: 1 }, { t: 5 * PERIOD, value: 1 }], (t) => t / PERIOD, (v) => v);
  expect(path).toBe("M0.0,1.0L1.0,1.0M5.0,1.0");
});
