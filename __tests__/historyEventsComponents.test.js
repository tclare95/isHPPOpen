import { fireEvent, render, screen, within } from "@testing-library/react";
import useFetch from "../libs/useFetch";
import EventsExplorer from "../components/history/events/EventsExplorer";
import EventDetail from "../components/history/events/EventDetail";
import PeriodEvents from "../components/history/events/PeriodEvents";
import { monthBounds } from "../libs/history/ukCalendar";

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

// Two events in the API's public shape: a fully observed one crossing the 2023/2024 year
// boundary, and one whose start and middle were not observed.
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
  peak: { value: 2.31, at: "2024-03-01T07:00:00.000Z", provisional: false, complete: false },
  start: boundary("unknown", { edgeAt: "2024-03-01T06:00:00.000Z", gap: { from: "2024-02-20T00:00:00.000Z", to: "2024-03-01T06:00:00.000Z", reason: "read_failed" }, beyond: { state: "above", at: "2024-02-19T23:45:00.000Z" } }),
  end: boundary("observed", { edgeAt: "2024-03-01T09:00:00.000Z", belowAt: "2024-03-01T09:15:00.000Z" }),
  dips: [], gaps: [{ from: "2024-03-01T07:15:00.000Z", to: "2024-03-01T08:15:00.000Z", ms: HOUR, reason: "no_readings" }],
  readings: { total: 9, atOrAbove: 9, provisional: 0, edited: 0, revised: 0, excluded: 0 },
  complete: false, brief: true, limitations: ["start_unobserved", "gaps_within"],
};
const INDEX = {
  rule: { thresholdMetres: 2.2, maxSupportedGapMs: 30 * 60000, mergeWindowMs: 24 * HOUR, briefMs: 6 * HOUR },
  events: [JANUARY, PARTIAL], monthsFailed: [], coverage: "unknown",
  firstReadingAt: "2016-01-01T00:00:00.000Z", lastReadingAt: "2026-11-05T11:45:00.000Z", dataEnd: "2026-11-05T12:00:00.000Z",
};

function mockFetch(result) {
  useFetch.mockImplementation(() => result);
}

beforeEach(() => {
  jest.clearAllMocks();
  search = "";
  jest.useFakeTimers({ now: Date.parse("2026-11-05T12:00:00Z") });
});
afterEach(() => jest.useRealTimers());

describe("events explorer", () => {
  test("lists every event with observed peaks, durations and honest limitations", () => {
    mockFetch({ data: INDEX });
    render(<EventsExplorer />);
    expect(screen.getByRole("heading", { name: "High-water events", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/River levels, not HPP closures/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2 events in all years" })).toBeInTheDocument();

    const list = screen.getAllByRole("list").find((element) => element.classList.contains("events-list"));
    const links = within(list).getAllByRole("link");
    // Newest first by default.
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/history/events/20240301T0600Z", "/history/events/20231219T1745Z"]);
    expect(within(links[0]).getByText("Start not observed")).toBeInTheDocument();
    expect(within(links[0]).getByText("Readings missing during event")).toBeInTheDocument();
    expect(within(links[0]).getByText("at least 2 h")).toBeInTheDocument();
    expect(within(links[1]).getByText("19 Dec 2023 – 10 Jan 2024")).toBeInTheDocument();
    expect(within(links[1]).getByText("21.3 days")).toBeInTheDocument();

    const spotlight = screen.getByRole("heading", { name: "Highest observed peaks" }).closest("section");
    expect(within(spotlight).getAllByRole("link")[0]).toHaveTextContent("5.34 m");
    expect(within(spotlight).getByText(/not a flood record/)).toBeInTheDocument();
  });

  test("a selected month includes events that began earlier, without cutting them at the boundary", () => {
    search = "year=2024&month=1";
    mockFetch({ data: INDEX });
    render(<EventsExplorer />);
    expect(screen.getByRole("heading", { name: "1 event in January 2024" })).toBeInTheDocument();
    expect(screen.getByText("Began before January 2024")).toBeInTheDocument();
    expect(screen.getByText("21.3 days", { selector: ".events-row__value" })).toBeInTheDocument();
  });

  test("filters update the URL so a view can be shared", () => {
    mockFetch({ data: INDEX });
    render(<EventsExplorer />);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort events" }), { target: { value: "peak" } });
    expect(replace).toHaveBeenLastCalledWith("/history/events?sort=peak", { scroll: false });
    fireEvent.click(screen.getByRole("checkbox", { name: /Hide brief/ }));
    expect(replace).toHaveBeenLastCalledWith("/history/events?brief=hide", { scroll: false });
    fireEvent.change(screen.getByRole("combobox", { name: "Year" }), { target: { value: "2024" } });
    expect(replace).toHaveBeenLastCalledWith("/history/events?year=2024", { scroll: false });
  });

  test("a failed read is never shown as a period without events", () => {
    mockFetch({ error: { payload: { error: { message: "River history is temporarily unavailable.", details: { reason: "temporary" } } } } });
    render(<EventsExplorer />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Read failed.*not the same as having no river data/);
    expect(screen.queryByText(/No high-water events were identified/)).not.toBeInTheDocument();
  });

  test("unreadable months are disclosed", () => {
    mockFetch({ data: { ...INDEX, monthsFailed: [{ year: 2024, month: 2, error: "THROTTLED" }] } });
    render(<EventsExplorer />);
    expect(screen.getByText(/1 month could not be read yet \(Feb 2024\)/)).toBeInTheDocument();
  });
});

describe("event detail", () => {
  const detail = (event, extra = {}) => ({
    found: true, match: "exact", ...INDEX, event, rank: { byPeak: 1, byDuration: 1, of: 2 }, previous: null, next: null,
    window: { from: "2024-02-27T06:00:00.000Z", to: "2024-03-04T09:00:00.000Z", trimmed: false, monthsFailed: [] },
    readings: [[Date.parse("2024-03-01T06:00:00Z") / 1000, 2.25, 0]], inProgress: false, oldestReadAt: "2026-11-05T11:00:00.000Z", ...extra,
  });

  test("a fully observed event tells the rise, peak and return with times", () => {
    mockFetch({ data: detail(JANUARY, { next: { id: PARTIAL.id, firstAboveAt: PARTIAL.firstAboveAt, peak: 2.31 } }) });
    render(<EventDetail id={JANUARY.id} />);
    expect(screen.getByRole("heading", { name: "19 Dec 2023 – 10 Jan 2024", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Fully observed")).toBeInTheDocument();
    expect(screen.getByText(/Highest of 2 events identified/)).toBeInTheDocument();
    expect(screen.getByText("Rise observed")).toBeInTheDocument();
    expect(screen.getByText(/Below 2.2 m at 19 Dec 2023, 17:30; at or above by 19 Dec 2023, 17:45/)).toBeInTheDocument();
    expect(screen.getByText("Return below observed")).toBeInTheDocument();
    expect(screen.getByText(/River levels, not HPP closures/)).toBeInTheDocument();
    expect(screen.getByText("Readings in event")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next event/ })).toHaveAttribute("href", `/history/events/${PARTIAL.id}`);
    expect(screen.getByRole("link", { name: "Open this month in the history explorer" })).toHaveAttribute("href", "/history?year=2023&month=12");
  });

  test("an incomplete event never claims an exact start, duration or peak", () => {
    mockFetch({ data: detail(PARTIAL) });
    render(<EventDetail id={PARTIAL.id} />);
    expect(screen.getAllByText("Start not observed").length).toBeGreaterThan(0);
    expect(screen.getByText(/may have begun earlier/)).toBeInTheDocument();
    expect(screen.getByText(/the archive could not be read/)).toBeInTheDocument();
    expect(screen.getByText("Highest observed")).toBeInTheDocument();
    expect(screen.getByText(/true peak may have been higher/)).toBeInTheDocument();
    expect(screen.getByText(/for at least 2 h of observed time/)).toBeInTheDocument();
    expect(screen.getByText(/true duration may be longer/)).toBeInTheDocument();
    expect(screen.getByText(/1 h from .*no readings were returned\. Not counted as at or above/)).toBeInTheDocument();
  });

  test("a link moved by provider revisions says so", () => {
    mockFetch({ data: detail(JANUARY, { match: "moved" }) });
    render(<EventDetail id="20240104T2015Z" />);
    expect(screen.getByText(/This link pointed to 4 Jan 2024, 20:15\. After corrections to the archive/)).toBeInTheDocument();
  });

  test("an event that no longer exists is explained, not an error page", () => {
    mockFetch({ error: { payload: { error: { message: "No high-water event…", details: { reason: "not_found" } } } } });
    render(<EventDetail id="20240301T0000Z" />);
    expect(screen.getByRole("heading", { name: "Event not found" })).toBeInTheDocument();
    expect(screen.getByText(/provider correction can move or remove one/)).toBeInTheDocument();
  });
});

describe("events in the history explorer", () => {
  test("lists events overlapping the selected month and links to the event list", () => {
    mockFetch({ data: INDEX });
    const { from, to } = monthBounds(2024, 1);
    render(<PeriodEvents from={from} to={to} label="January 2024" year={2024} month={1} />);
    expect(screen.getByRole("link", { name: /19 Dec 2023 – 10 Jan 2024/ })).toHaveAttribute("href", "/history/events/20231219T1745Z");
    expect(screen.getByText("Began before January 2024")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See all events this month/ })).toHaveAttribute("href", "/history/events?year=2024&month=1");
  });

  test("says when no reading reached the threshold, and renders nothing while unavailable", () => {
    mockFetch({ data: INDEX });
    const { from, to } = monthBounds(2024, 7);
    const { unmount } = render(<PeriodEvents from={from} to={to} label="July 2024" year={2024} month={7} />);
    expect(screen.getByText(/No reading at or above 2.2 m in the observations available for July 2024/)).toBeInTheDocument();
    unmount();
    mockFetch({ error: new Error("x") });
    const { container } = render(<PeriodEvents from={from} to={to} label="July 2024" year={2024} month={7} />);
    expect(container).toBeEmptyDOMElement();
  });
});
