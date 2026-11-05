import { fireEvent, render, screen, within } from "@testing-library/react";
import useFetch from "../libs/useFetch";
import { buildOverview } from "../libs/history/aggregate";
import { buildPeriodDigest } from "../libs/history/digest";
import { monthBounds } from "../libs/history/ukCalendar";
import HistoryExplorer from "../components/history/HistoryExplorer";
import DayCalendar, { dayState } from "../components/history/DayCalendar";
import LevelChart from "../components/history/LevelChart";
import HistoricalConditions from "../components/layout/frontpage/historicalConditions";
import StatusArea from "../components/layout/frontpage/statusarea";

jest.mock("../libs/useFetch", () => jest.fn());
const replace = jest.fn();
let search = "year=2024&month=11";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const MIN = 60000;
const GOOD = JSON.stringify({ quality: "Good" });
const ASOF = Date.parse("2026-11-05T12:00:00Z");

function monthPayload(year, month, value, { keep = () => true } = {}) {
  const { from, to } = monthBounds(year, month);
  const rows = [];
  for (let t = from - 30 * MIN; t < to + 30 * MIN; t += 15 * MIN) {
    if (keep(t, from)) rows.push({ observedAt: new Date(t).toISOString(), value: typeof value === "function" ? value(t, from) : value, quality: GOOD });
  }
  return { year, month, label: "", ...buildPeriodDigest(rows, { from, to, asOf: ASOF }), source: { readAt: "2026-11-05T12:00:00Z" } };
}

const overview = (() => {
  const months = [];
  for (let year = 2016; year <= 2025; year++) months.push({ year, month: 11, digest: monthPayload(year, 11, 1.0 + (year - 2016) / 10) });
  return buildOverview(months, { currentYear: 2026 });
})();

function mockFetches(map) {
  useFetch.mockImplementation((url) => {
    const key = Object.keys(map).find((prefix) => url.startsWith(prefix));
    return map[key] ?? { data: undefined, error: undefined, isPending: true };
  });
}

const levels = { data: { level_data: [{ reading_date: "2026-11-05T10:00:00Z", reading_level: 1.95 }] } };

beforeEach(() => {
  jest.clearAllMocks();
  search = "year=2024&month=11";
});

describe("history explorer", () => {
  beforeEach(() => jest.useFakeTimers({ now: ASOF }));
  afterEach(() => jest.useRealTimers());

  test("shows a month with threshold time, its denominator and seasonal context", () => {
    const month = monthPayload(2024, 11, (t, from) => (t < from + 3 * 86400000 ? 2.4 : 1.2));
    mockFetches({ "/api/history/colwick/overview": { data: overview }, "/api/history/colwick/month": { data: month }, "/api/levels": levels });
    render(<HistoryExplorer />);

    expect(screen.getByRole("heading", { name: "November 2024", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Time at or above 2.2 m").previousSibling).toHaveTextContent(/^10%$/);
    expect(screen.getByText(/3 days of 30 days supported time/)).toBeInTheDocument();
    expect(screen.getByText(/Typical November \(2016–2025\)/)).toBeInTheDocument();
    expect(screen.getByText("Much higher than usual for November")).toBeInTheDocument();
    expect(screen.getByText(/not a record of when the course actually opened or closed/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Days of the month/ })).toBeInTheDocument();
  });

  test("a failed read is distinct from an empty period", () => {
    mockFetches({
      "/api/history/colwick/overview": { data: overview },
      "/api/history/colwick/month": { error: { payload: { error: { message: "Archived observations for this period could not be verified.", details: { reason: "integrity" } } } } },
      "/api/levels": levels,
    });
    render(<HistoryExplorer />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Read failed.");
    expect(alert).toHaveTextContent("not the same as having no river data");
    expect(screen.queryByText(/No observations for/)).not.toBeInTheDocument();
  });

  test("an empty period says so without inventing a percentage", () => {
    mockFetches({ "/api/history/colwick/overview": { data: overview }, "/api/history/colwick/month": { data: monthPayload(2024, 11, 1, { keep: () => false }) }, "/api/levels": levels });
    render(<HistoryExplorer />);
    expect(screen.getByText("No observations for November 2024")).toBeInTheDocument();
    expect(screen.getByText(/not a sign that the river was low or that HPP was open/)).toBeInTheDocument();
    expect(screen.queryByText("Time at or above 2.2 m")).not.toBeInTheDocument();
  });

  test("limited support withholds the percentage", () => {
    const sparse = monthPayload(2024, 11, 2.5, { keep: (t, from) => t < from + 5 * 86400000 });
    mockFetches({ "/api/history/colwick/overview": { data: overview }, "/api/history/colwick/month": { data: sparse }, "/api/levels": levels });
    render(<HistoryExplorer />);
    expect(screen.getByText(/too little for a meaningful percentage/)).toBeInTheDocument();
    expect(screen.getByText("Time at or above 2.2 m").previousSibling).toHaveTextContent("—");
    expect(screen.getByText(/percentage withheld/)).toBeInTheDocument();
  });

  test("seasonal context failure does not block the period view", () => {
    mockFetches({
      "/api/history/colwick/overview": { error: { payload: { error: { message: "River history is temporarily unavailable.", details: { reason: "temporary" } } } } },
      "/api/history/colwick/month": { data: monthPayload(2024, 11, 1.2) },
      "/api/levels": levels,
    });
    render(<HistoryExplorer />);
    expect(screen.getByText(/Seasonal context is unavailable right now/)).toBeInTheDocument();
    expect(screen.getByText("Time at or above 2.2 m")).toBeInTheDocument();
  });

  test("changing period updates the URL", () => {
    mockFetches({ "/api/history/colwick/overview": { data: overview }, "/api/history/colwick/month": { data: monthPayload(2024, 11, 1.2) }, "/api/levels": levels });
    render(<HistoryExplorer />);
    fireEvent.click(screen.getByRole("button", { name: "Previous period" }));
    expect(replace).toHaveBeenCalledWith("/history?year=2024&month=10", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Whole year" }));
    expect(replace).toHaveBeenLastCalledWith("/history?year=2024", { scroll: false });
  });

  test("invalid query parameters fall back to a valid period", () => {
    search = "year=1999&month=44";
    mockFetches({ "/api/levels": levels });
    render(<HistoryExplorer />);
    expect(useFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/history\/colwick\/year\?year=20\d\d$/), expect.anything());
  });
});

describe("day calendar", () => {
  test("classifies days by supported time and never treats gaps as below", () => {
    expect(dayState({ elapsedMs: 0, aboveMs: 0, belowMs: 0 })).toBe("future");
    expect(dayState({ elapsedMs: 100, aboveMs: 0, belowMs: 40 })).toBe("unknown");
    expect(dayState({ elapsedMs: 100, aboveMs: 100, belowMs: 0 })).toBe("above");
    expect(dayState({ elapsedMs: 100, aboveMs: 10, belowMs: 90 })).toBe("mixed");
    expect(dayState({ elapsedMs: 100, aboveMs: 0, belowMs: 100 })).toBe("below");
  });

  test("selecting a day reports its date", () => {
    const onSelect = jest.fn();
    const { days } = monthPayload(2024, 11, 1.2);
    render(<DayCalendar days={days} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Fri, 1 Nov 2024: Below 2.2 m/ }));
    expect(onSelect).toHaveBeenCalledWith("2024-11-01");
  });
});

describe("level chart", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  });
  afterAll(() => {
    delete HTMLElement.prototype.clientWidth;
  });

  test("draws gaps explicitly and never joins across them", () => {
    const { from, to } = monthBounds(2024, 11);
    const readings = [];
    for (let t = from; t < to; t += 15 * MIN) {
      if (t < from + 86400000 || t >= from + 2 * 86400000) readings.push([t / 1000, 1.2, 0]);
    }
    const { container } = render(<LevelChart mode="month" from={from} to={to} end={to} readings={readings} title="Test chart" />);
    expect(screen.getByRole("img", { name: "Test chart" })).toBeInTheDocument();
    expect(container.querySelectorAll(".history-chart__line")).toHaveLength(2);
    expect(container.querySelectorAll('rect[fill="url(#history-hatch)"]')).toHaveLength(1);
    expect(container.querySelector(".history-chart__threshold")).toBeInTheDocument();
  });
});

describe("home page", () => {
  test("historical conditions replace the hard-coded closure tables with attributable figures", () => {
    mockFetches({ "/api/history/colwick/overview": { data: overview } });
    render(<HistoricalConditions />);
    expect(screen.getByRole("link", { name: /Explore river history/ })).toHaveAttribute("href", "/history");
    expect(screen.getByText(/they are not a record of when HPP actually closed/)).toBeInTheDocument();
    expect(screen.getByText("By month (2016–2025)")).toBeInTheDocument();
  });

  test("a history failure leaves the live status area working", () => {
    mockFetches({
      "/api/hppstatus": { data: { currentStatus: true, closuresInLast7Days: 2, closuresInLast28Days: 3, closuresInLast182Days: 10, health: null } },
      "/api/history/colwick/overview": { error: new Error("down") },
    });
    render(<StatusArea />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText(/of the last 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Historical river-level statistics are unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText("Yearly Closure Trend")).not.toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Historical river-level conditions" });
    expect(within(section).queryByRole("table")).not.toBeInTheDocument();
  });
});
