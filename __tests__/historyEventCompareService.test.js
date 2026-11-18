/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { __resetHistoryReaderForTests, COMPARE_MAX_WINDOW_MS, getEventComparison } from "../libs/history/historyService";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const NOW = Date.parse("2016-04-10T12:00:00Z");
const MIN = 60000;
const at = (iso) => Date.parse(iso);

// Two events of differing duration: a fully observed three-day event, and a twelve-hour one
// with provisional readings and two hours without readings in the middle. `shift` moves the
// first event's rise to model a provider correction.
function level(t, shift) {
  if (t >= at("2016-01-30T06:00:00Z") + shift && t < at("2016-02-02T06:00:00Z")) return t === at("2016-01-31T12:00:00Z") ? 3.6 : 2.8;
  if (t >= at("2016-03-10T06:00:00Z") && t < at("2016-03-10T18:00:00Z")) return t === at("2016-03-10T09:00:00Z") ? 2.9 : 2.5;
  return 1.3;
}
const quality = (t) => JSON.stringify({ quality: t >= at("2016-03-10T12:00:00Z") && t < at("2016-03-11T00:00:00Z") ? "Unchecked" : "Good" });
const missing = (t) => t >= at("2016-03-10T13:00:00Z") && t < at("2016-03-10T15:00:00Z");

function fakeReader({ shift = 0, fail = () => null } = {}) {
  return {
    getObservations: jest.fn(async (id, { from, to }) => {
      const failure = fail(from, to);
      if (failure) throw failure;
      const data = [];
      for (let t = Math.ceil(Date.parse(from) / (15 * MIN)) * 15 * MIN; t < Date.parse(to); t += 15 * MIN) {
        if (!missing(t)) data.push({ observedAt: new Date(t).toISOString(), value: level(t, shift), quality: quality(t), revision: shift ? 2 : 1 });
      }
      return { data, meta: { measurementId: id, nextCursor: null, requestAsOf: new Date(NOW).toISOString(), coverage: { status: "unknown", gaps: [] } } };
    }),
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] });
  __resetHistoryReaderForTests();
});
afterEach(() => jest.useRealTimers());

test("two events of differing duration each come with their own bounded readings window", async () => {
  const reader = fakeReader();
  createRdpClient.mockReturnValue(reader);
  const result = await getEventComparison(["20160130T0600Z", "20160310T0600Z"]);
  expect(Object.keys(reader)).toEqual(["getObservations"]);
  expect(result).toMatchObject({ ready: true, sameEvent: false, inProgress: false, monthsFailed: [] });
  const [long, short] = result.events;
  expect(long).toMatchObject({ requested: "20160130T0600Z", found: true, match: "exact", rank: { byPeak: 1, byDuration: 1, of: 2 } });
  expect(long.event).toMatchObject({ aboveMs: 72 * 60 * MIN, complete: true, limitations: [] });
  expect(long.window).toEqual({ from: "2016-01-29T06:00:00.000Z", to: "2016-02-03T05:45:00.000Z", trimmed: false, monthsFailed: [] });
  expect(long.readings).toHaveLength((Date.parse(long.window.to) - Date.parse(long.window.from)) / (15 * MIN));

  expect(short).toMatchObject({ found: true, match: "exact", rank: { byPeak: 2, byDuration: 2, of: 2 } });
  expect(short.event.limitations).toEqual(expect.arrayContaining(["gaps_within", "provisional"]));
  expect(short.event.gaps).toEqual([expect.objectContaining({ reason: "no_readings" })]);
  expect(short.event.peak).toMatchObject({ value: 2.9, complete: false });
  // Missing readings stay missing; provisional readings keep their flag.
  const times = short.readings.map(([seconds]) => seconds * 1000);
  expect(times).not.toContain(at("2016-03-10T14:00:00Z"));
  expect(short.readings.find(([seconds]) => seconds * 1000 === at("2016-03-10T16:00:00Z"))[2]).toBe(1);
  for (const slot of result.events) {
    expect(Date.parse(slot.window.to) - Date.parse(slot.window.from)).toBeLessThanOrEqual(COMPARE_MAX_WINDOW_MS);
  }
});

test("a corrected start resolves a link to the event now containing it, as on the detail page", async () => {
  createRdpClient.mockReturnValue(fakeReader({ shift: -2 * 60 * MIN }));
  const result = await getEventComparison(["20160130T0600Z", "20160310T0600Z"]);
  expect(result.ready).toBe(true);
  expect(result.events[0]).toMatchObject({ requested: "20160130T0600Z", match: "moved", event: { id: "20160130T0400Z" } });
  expect(result.events[0].readings.length).toBeGreaterThan(0);
});

test("a link revised away is not replaced by another event and no readings are read for the pair", async () => {
  createRdpClient.mockReturnValue(fakeReader({ shift: 2 * 60 * MIN }));
  const result = await getEventComparison(["20160130T0600Z", "20160310T0600Z"]);
  expect(result.ready).toBe(false);
  expect(result.events[0]).toEqual({ requested: "20160130T0600Z", found: false, match: "not_found" });
  expect(result.events[1]).toMatchObject({ found: true, event: { id: "20160310T0600Z" } });
  expect(result.events[1]).not.toHaveProperty("readings");
});

test("two links that resolve to the same event are flagged instead of compared", async () => {
  createRdpClient.mockReturnValue(fakeReader());
  const result = await getEventComparison(["20160130T0600Z", "20160131T1200Z"]);
  expect(result).toMatchObject({ ready: false, sameEvent: true });
  expect(result.events.map((slot) => slot.match)).toEqual(["exact", "moved"]);
  expect(result.events.every((slot) => !("readings" in slot))).toBe(true);
});

test("a month that cannot be read is disclosed on the affected event, never joined across", async () => {
  createRdpClient.mockReturnValue(fakeReader({ fail: (from) => (from.startsWith("2016-01-31") ? new RdpError("THROTTLED") : null) }));
  const result = await getEventComparison(["20160130T0600Z", "20160310T0600Z"]);
  expect(result.monthsFailed).toEqual([{ year: 2016, month: 2, error: "THROTTLED" }]);
  expect(result.events[0].event.limitations).toContain("end_unobserved");
  expect(result.events[0].window.monthsFailed).toEqual([{ year: 2016, month: 2, error: "THROTTLED" }]);
});

test("a complete read failure propagates for the route to map", async () => {
  createRdpClient.mockReturnValue(fakeReader({ fail: () => new RdpError("ARCHIVE_INTEGRITY") }));
  await expect(getEventComparison(["20160130T0600Z", "20160310T0600Z"])).rejects.toMatchObject({ code: "ARCHIVE_INTEGRITY" });
});
