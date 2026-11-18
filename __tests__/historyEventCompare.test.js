import { fireEvent, render, screen, within } from "@testing-library/react";
import useFetch from "../libs/useFetch";
import EventComparison from "../components/history/events/EventComparison";
import EventDetail from "../components/history/events/EventDetail";
import EventsExplorer from "../components/history/events/EventsExplorer";
import { relativeLabel, relativeTicks } from "../components/history/events/CompareChart";
import { alignAnchor, compareHref, comparisonDifferences, comparisonRows, readCompareParams } from "../libs/history/eventCompare";

jest.mock("../libs/useFetch", () => jest.fn());
const replace = jest.fn();
const push = jest.fn();
let search = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(search),
}));

const HOUR = 3600000;
const boundary = (status, extra = {}) => ({ status, edgeAt: null, belowAt: null, gap: null, beyond: null, ongoing: false, ...extra });

// Public API shapes: a long fully observed event, and a brief one whose start was not observed,
// with readings missing inside and provisional readings.
const JANUARY = {
  id: "20231219T1745Z", firstAboveAt: "2023-12-19T17:45:00.000Z", lastAboveAt: "2024-01-10T00:15:00.000Z",
  spanMs: 510.5 * HOUR, aboveMs: 510.8 * HOUR, belowWithinMs: 0, unknownWithinMs: 0, riseMs: 386.5 * HOUR, fallMs: 124 * HOUR,
  peak: { value: 5.343, at: "2024-01-04T20:15:00.000Z", provisional: false, complete: true },
  start: boundary("observed", { edgeAt: "2023-12-19T17:45:00.000Z", belowAt: "2023-12-19T17:30:00.000Z" }),
  end: boundary("observed", { edgeAt: "2024-01-10T00:15:00.000Z", belowAt: "2024-01-10T00:30:00.000Z" }),
  dips: [], gaps: [], readings: { total: 2043, atOrAbove: 2043, provisional: 0, edited: 413, revised: 0, excluded: 0 },
  complete: true, brief: false, limitations: [],
};
const PARTIAL = {
  id: "20240301T0600Z", firstAboveAt: "2024-03-01T06:00:00.000Z", lastAboveAt: "2024-03-01T09:00:00.000Z",
  spanMs: 3 * HOUR, aboveMs: 2 * HOUR, belowWithinMs: 0, unknownWithinMs: HOUR, riseMs: HOUR, fallMs: 2 * HOUR,
  peak: { value: 2.31, at: "2024-03-01T07:00:00.000Z", provisional: true, complete: false },
  start: boundary("unknown", { edgeAt: "2024-03-01T06:00:00.000Z", gap: { from: "2024-02-20T00:00:00.000Z", to: "2024-03-01T06:00:00.000Z", reason: "read_failed" }, beyond: { state: "above", at: "2024-02-19T23:45:00.000Z" } }),
  end: boundary("observed", { edgeAt: "2024-03-01T09:00:00.000Z", belowAt: "2024-03-01T09:15:00.000Z" }),
  dips: [], gaps: [{ from: "2024-03-01T07:15:00.000Z", to: "2024-03-01T08:15:00.000Z", ms: HOUR, reason: "no_readings" }],
  readings: { total: 9, atOrAbove: 9, provisional: 4, edited: 0, revised: 0, excluded: 0 },
  complete: false, brief: true, limitations: ["start_unobserved", "gaps_within", "provisional"],
};
const COMPLETE_B = {
  ...JANUARY, id: "20200209T1200Z", firstAboveAt: "2020-02-09T12:00:00.000Z", lastAboveAt: "2020-03-05T04:00:00.000Z",
  aboveMs: 592.8 * HOUR, peak: { value: 4.982, at: "2020-02-18T06:00:00.000Z", provisional: false, complete: true },
};
const INDEX = { rule: { thresholdMetres: 2.2, briefMs: 6 * HOUR }, events: [COMPLETE_B, JANUARY, PARTIAL], monthsFailed: [], dataEnd: "2026-11-05T12:00:00.000Z" };

const seconds = (iso) => Date.parse(iso) / 1000;
const slot = (event, extra = {}) => ({
  requested: event.id, found: true, match: "exact", event, rank: { byPeak: 1, byDuration: 1, of: 3 }, inProgress: false,
  window: {
    from: new Date(Date.parse(event.firstAboveAt) - 24 * HOUR).toISOString(),
    to: new Date(Date.parse(event.lastAboveAt) + 24 * HOUR).toISOString(), trimmed: false, monthsFailed: [],
  },
  readings: [[seconds(event.firstAboveAt), 2.25, 0], [seconds(event.peak.at), event.peak.value, event.peak.provisional ? 1 : 0]],
  ...extra,
});
const comparison = (a, b, extra = {}) => ({ ready: true, sameEvent: false, monthsFailed: [], inProgress: false, events: [a, b], ...extra });
const unread = (item) => {
  const { readings, window, ...rest } = item;
  return rest;
};

let responses;
function mockResponses(map) {
  responses = map;
  useFetch.mockImplementation((path) => (path === null ? { isPending: true } : responses[path.split("?")[0]] ?? { isPending: true }));
}
const comparePaths = () => useFetch.mock.calls.map(([path]) => path).filter((path) => path?.includes("/compare"));
const TEMPORARY = { error: { payload: { error: { message: "River history is temporarily unavailable.", details: { reason: "temporary" } } } } };

beforeEach(() => {
  jest.clearAllMocks();
  search = "";
  jest.useFakeTimers({ now: Date.parse("2026-11-05T12:00:00Z") });
});
afterEach(() => jest.useRealTimers());

describe("comparison wording", () => {
  test("two fully observed events state exact differences", () => {
    expect(comparisonDifferences(JANUARY, COMPLETE_B)).toEqual([
      "The first event reached 0.36 m higher.",
      "The second event stayed at or above 2.2 m for 3.4 days longer.",
    ]);
  });

  test("an unobserved peak or duration is never ranked below an exact one", () => {
    const lines = comparisonDifferences(JANUARY, PARTIAL);
    // The partial event's observed values are lower, but they are only lower bounds.
    expect(lines[0]).toMatch(/true peak of the second event may not have been observed, so which peaked higher is not known/);
    expect(lines[1]).toMatch(/longer is not known: part of the second event was not observed/);
    expect(lines[2]).toMatch(/Provisional readings .* may change/);
  });

  test("a lower bound that already exceeds an exact value supports 'at least'", () => {
    const big = { ...PARTIAL, peak: { ...PARTIAL.peak, value: 6 }, aboveMs: 600 * HOUR };
    expect(comparisonDifferences(big, JANUARY).slice(0, 2)).toEqual([
      "The first event reached at least 0.66 m higher.",
      "The first event stayed at or above 2.2 m for at least 3.7 days longer.",
    ]);
  });

  test("rows qualify incomplete durations, boundaries and peaks", () => {
    const rows = Object.fromEntries(comparisonRows(JANUARY, PARTIAL).map((row) => [row.label, row.values]));
    expect(rows["Highest reading"]).toEqual(["5.34 m", "2.31 m (highest observed) · provisional"]);
    expect(rows["Time at or above 2.2 m"]).toEqual(["21.3 days", "at least 2 h"]);
    expect(rows["Rise to highest reading"]).toEqual(["16.1 days", "at least 1 h"]);
    expect(rows["Highest reading to recovery"]).toEqual(["5.2 days", "2 h"]);
    expect(rows["First to last reading at or above"]).toEqual(["21.3 days", "at least 3 h"]);
    expect(rows["Dips below / missing readings"]).toEqual(["No dips · no gaps", "No dips · 1 h missing"]);
    const ongoing = { ...JANUARY, end: { ...JANUARY.end, status: "unknown", ongoing: true }, limitations: ["ongoing"] };
    expect(comparisonRows(ongoing, JANUARY).find((row) => row.label === "Highest reading to recovery").values[0]).toBe("No end yet");
  });

  test("URL state round-trips and malformed ids are reported, not guessed", () => {
    expect(compareHref("20231219T1745Z", "20240301T0600Z")).toBe("/history/events/compare?a=20231219T1745Z&b=20240301T0600Z");
    expect(compareHref("20231219T1745Z", null, "start")).toBe("/history/events/compare?a=20231219T1745Z&align=start");
    expect(compareHref()).toBe("/history/events/compare");
    expect(readCompareParams(new URLSearchParams("a=20231219T1745Z&b=2024-03-01&align=sideways"))).toEqual({
      a: "20231219T1745Z", b: null, invalid: { a: false, b: true }, align: "peak",
    });
    expect(alignAnchor(JANUARY, "peak")).toBe(Date.parse(JANUARY.peak.at));
    expect(alignAnchor(JANUARY, "start")).toBe(Date.parse(JANUARY.firstAboveAt));
  });

  test("relative axis labels are signed hours or days from the alignment point", () => {
    expect(relativeLabel(0)).toBe("0");
    expect(relativeLabel(-2 * 24 * HOUR)).toBe("−2 d");
    expect(relativeLabel(12 * HOUR)).toBe("+12 h");
    expect(relativeTicks(-3 * 24 * HOUR, 5 * 24 * HOUR, 640)).toContain(0);
  });
});

describe("comparison page", () => {
  test("two events are compared side by side with their limitations, dates and links", () => {
    search = `a=${JANUARY.id}&b=${PARTIAL.id}`;
    mockResponses({ "/api/history/colwick/events": { data: INDEX }, "/api/history/colwick/events/compare": { data: comparison(slot(JANUARY), slot(PARTIAL)) } });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
    try {
      const { container } = render(<EventComparison />);
      expect(comparePaths()).toContain(`/api/history/colwick/events/compare?a=${JANUARY.id}&b=${PARTIAL.id}`);
      expect(screen.getByRole("heading", { name: "Compare high-water events", level: 1 })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "19 Dec 2023 – 10 Jan 2024" })).toHaveAttribute("href", `/history/events/${JANUARY.id}`);
      expect(screen.getByRole("link", { name: "1 Mar 2024" })).toHaveAttribute("href", `/history/events/${PARTIAL.id}`);
      expect(screen.getByText("Fully observed")).toBeInTheDocument();
      expect(screen.getAllByText("Start not observed").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Readings missing during event").length).toBeGreaterThan(0);

      const table = screen.getByRole("table");
      expect(within(table).getByText("at least 2 h")).toBeInTheDocument();
      expect(within(table).getByText("2.31 m (highest observed) · provisional")).toBeInTheDocument();
      expect(screen.getByRole("list", { name: "Differences" })).toHaveTextContent(/which peaked higher is not known/);

      // Two series overlaid, with provisional readings dashed and gaps disclosed.
      expect(container.querySelectorAll(".events-compare--a .events-compare__line").length).toBeGreaterThan(0);
      expect(container.querySelectorAll(".events-compare--b .events-compare__line--provisional").length).toBeGreaterThan(0);
      expect(container.querySelectorAll("[fill='url(#compare-hatch)']").length).toBeGreaterThan(0);
      expect(screen.getByText(/Provisional \(dashed\)/)).toBeInTheDocument();
      expect(screen.getByText(/not a travel time or a prediction/)).toBeInTheDocument();
    } finally {
      delete HTMLElement.prototype.clientWidth;
    }
  });

  test("alignment and selections live in the URL", () => {
    search = `a=${JANUARY.id}&b=${PARTIAL.id}`;
    mockResponses({ "/api/history/colwick/events": { data: INDEX }, "/api/history/colwick/events/compare": { data: comparison(slot(JANUARY), slot(PARTIAL)) } });
    render(<EventComparison />);
    fireEvent.click(screen.getByRole("button", { name: "First at or above 2.2 m" }));
    expect(replace).toHaveBeenLastCalledWith(`/history/events/compare?a=${JANUARY.id}&b=${PARTIAL.id}&align=start`, { scroll: false });
    fireEvent.change(screen.getByRole("combobox", { name: /Second event/ }), { target: { value: COMPLETE_B.id } });
    expect(replace).toHaveBeenLastCalledWith(`/history/events/compare?a=${JANUARY.id}&b=${COMPLETE_B.id}`, { scroll: false });
  });

  test("a link moved by corrections is compared as the event now containing it, and says so", () => {
    search = `a=20240104T2015Z&b=${PARTIAL.id}`;
    mockResponses({
      "/api/history/colwick/events": { data: INDEX },
      "/api/history/colwick/events/compare": { data: comparison(slot(JANUARY, { requested: "20240104T2015Z", match: "moved" }), slot(PARTIAL)) },
    });
    render(<EventComparison />);
    expect(screen.getByText(/The link 4 Jan 2024, 20:15 now resolves to the event starting 19 Dec 2023, 17:45/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Update this comparison's link" }))
      .toHaveAttribute("href", `/history/events/compare?a=${JANUARY.id}&b=${PARTIAL.id}`);
  });

  test("a link that no longer resolves asks for a replacement instead of comparing another event", () => {
    search = `a=20240301T0000Z&b=${JANUARY.id}`;
    mockResponses({
      "/api/history/colwick/events": { data: INDEX },
      "/api/history/colwick/events/compare": {
        data: comparison({ requested: "20240301T0000Z", found: false, match: "not_found" }, unread(slot(JANUARY)), { ready: false }),
      },
    });
    render(<EventComparison />);
    expect(screen.getByRole("alert")).toHaveTextContent(/first event \(link: 1 Mar 2024, 00:00\) no longer matches .* Choose a replacement/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("two links that now resolve to one event are not compared", () => {
    search = `a=${JANUARY.id}&b=20240104T2015Z`;
    mockResponses({
      "/api/history/colwick/events": { data: INDEX },
      "/api/history/colwick/events/compare": {
        data: comparison(unread(slot(JANUARY)), unread(slot(JANUARY, { match: "moved" })), { ready: false, sameEvent: true }),
      },
    });
    render(<EventComparison />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Both selections now resolve to the same event/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test.each([
    ["the same event twice", `a=${JANUARY.id}&b=${JANUARY.id}`, /Both selections are the same event/],
    ["a malformed link", `a=${JANUARY.id}&b=yesterday`, /second event link is not a valid event/],
  ])("%s is not requested and asks for another choice", (_name, query, message) => {
    search = query;
    mockResponses({ "/api/history/colwick/events": { data: INDEX } });
    render(<EventComparison />);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(comparePaths()).toEqual([]);
  });

  test("a failed read is shown as a failure, not as an empty comparison", () => {
    search = `a=${JANUARY.id}&b=${PARTIAL.id}`;
    mockResponses({ "/api/history/colwick/events": { data: INDEX }, "/api/history/colwick/events/compare": TEMPORARY });
    render(<EventComparison />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Read failed.*not the same as having no river data/);
  });

  test("a trimmed window and unreadable months are disclosed", () => {
    search = `a=${JANUARY.id}&b=${PARTIAL.id}`;
    const trimmed = slot(JANUARY);
    trimmed.window = { ...trimmed.window, trimmed: true, monthsFailed: [{ year: 2024, month: 1, error: "THROTTLED" }] };
    mockResponses({ "/api/history/colwick/events": { data: INDEX }, "/api/history/colwick/events/compare": { data: comparison(trimmed, slot(PARTIAL)) } });
    render(<EventComparison />);
    expect(screen.getByText("Only the first part of the first event is charted.")).toBeInTheDocument();
    expect(screen.getByText(/Some months around these events could not be read/)).toBeInTheDocument();
  });
});

describe("entry points", () => {
  test("an event page offers comparison with its neighbours or any other event", () => {
    mockResponses({
      "/api/history/colwick/events/20240301T0600Z": {
        data: {
          found: true, match: "exact", ...INDEX, event: PARTIAL, rank: { byPeak: 3, byDuration: 3, of: 3 },
          previous: { id: JANUARY.id, firstAboveAt: JANUARY.firstAboveAt, peak: 5.343 }, next: null,
          window: { from: "2024-02-27T06:00:00.000Z", to: "2024-03-04T09:00:00.000Z", trimmed: false, monthsFailed: [] },
          readings: [], inProgress: false,
        },
      },
    });
    render(<EventDetail id={PARTIAL.id} />);
    const panel = screen.getByRole("heading", { name: "Compare with…" }).closest("section");
    const links = within(panel).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toEqual([`/history/events/compare?a=${PARTIAL.id}&b=${JANUARY.id}`, `/history/events/compare?a=${PARTIAL.id}`]);
  });

  test("the events explorer links to the comparison", () => {
    mockResponses({ "/api/history/colwick/events": { data: INDEX } });
    render(<EventsExplorer />);
    expect(screen.getByRole("link", { name: "Compare two events" })).toHaveAttribute("href", "/history/events/compare");
    expect(screen.getByRole("link", { name: /Compare the two highest/ }))
      .toHaveAttribute("href", `/history/events/compare?a=${JANUARY.id}&b=${COMPLETE_B.id}`);
  });
});
