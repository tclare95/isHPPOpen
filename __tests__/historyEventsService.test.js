/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { __resetHistoryReaderForTests, getEventDetail, getEventsIndex } from "../libs/history/historyService";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

// History starts in 2016, so a "now" in April 2016 keeps every read small.
const NOW = Date.parse("2016-04-10T12:00:00Z");
const MIN = 60000;
const GOOD = JSON.stringify({ quality: "Good" });
const RISE = Date.parse("2016-01-30T06:00:00Z");
const FALL = Date.parse("2016-02-02T06:00:00Z");
const PEAK = Date.parse("2016-01-31T12:00:00Z");

const level = (t) => (t >= RISE && t < FALL ? (t === PEAK ? 3.6 : 2.8) : 1.3);

// Read-only fake: the only call the event feature may make is getObservations.
function fakeReader({ fail = () => null } = {}) {
  return {
    getObservations: jest.fn(async (id, { from, to }) => {
      const failure = fail(from, to);
      if (failure) throw failure;
      const data = [];
      for (let t = Math.ceil(Date.parse(from) / (15 * MIN)) * 15 * MIN; t < Date.parse(to); t += 15 * MIN) {
        data.push({ observedAt: new Date(t).toISOString(), value: level(t), quality: GOOD, revision: 1 });
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

test("the index finds an event across a month boundary from the month reads", async () => {
  const reader = fakeReader();
  createRdpClient.mockReturnValue(reader);
  const index = await getEventsIndex();
  expect(Object.keys(reader)).toEqual(["getObservations"]);
  expect(reader.getObservations).toHaveBeenCalledTimes(4);
  expect(index.rule).toEqual({ thresholdMetres: 2.2, maxSupportedGapMs: 30 * MIN, mergeWindowMs: 24 * 60 * MIN, briefMs: 6 * 60 * MIN });
  expect(index.measurement).toMatchObject({ measurementId: "ea-colwick-level", unit: "mASD" });
  expect(index.monthsFailed).toEqual([]);
  expect(index.coverage).toBe("unknown");
  expect(index.events).toHaveLength(1);
  expect(index.events[0]).toMatchObject({
    id: "20160130T0600Z",
    firstAboveAt: "2016-01-30T06:00:00.000Z",
    lastAboveAt: "2016-02-02T05:45:00.000Z",
    aboveMs: FALL - RISE,
    peak: { value: 3.6, at: "2016-01-31T12:00:00.000Z", complete: true },
    start: { status: "observed", belowAt: "2016-01-30T05:45:00.000Z", ongoing: false },
    end: { status: "observed", belowAt: "2016-02-02T06:00:00.000Z", ongoing: false },
    complete: true,
  });
});

test("a month that fails to read is reported and splits rather than joins events", async () => {
  createRdpClient.mockReturnValue(fakeReader({
    fail: (from) => (from.startsWith("2016-01-31") ? new RdpError("THROTTLED") : null),
  }));
  const index = await getEventsIndex();
  expect(index.monthsFailed).toEqual([{ year: 2016, month: 2, error: "THROTTLED" }]);
  expect(index.events).toHaveLength(1);
  expect(index.events[0].end).toMatchObject({ status: "unknown", ongoing: false, gap: { reason: "read_failed" } });
  expect(index.events[0].limitations).toContain("end_unobserved");
});

test("an event's detail carries its readings with context, rank and neighbours", async () => {
  createRdpClient.mockReturnValue(fakeReader());
  const detail = await getEventDetail("20160130T0600Z");
  expect(detail).toMatchObject({ found: true, match: "exact", rank: { byPeak: 1, byDuration: 1, of: 1 }, previous: null, next: null, inProgress: false });
  expect(detail.window).toEqual({ from: "2016-01-27T06:00:00.000Z", to: "2016-02-05T05:45:00.000Z", trimmed: false, monthsFailed: [] });
  expect(detail.readings[0]).toEqual([Date.parse("2016-01-27T06:00:00Z") / 1000, 1.3, 0]);
  expect(detail.readings).toHaveLength((Date.parse(detail.window.to) - Date.parse(detail.window.from)) / (15 * MIN));

  const moved = await getEventDetail("20160131T1200Z");
  expect(moved).toMatchObject({ found: true, match: "moved", event: { id: "20160130T0600Z" } });
  const missing = await getEventDetail("20160301T0000Z");
  expect(missing).toMatchObject({ found: false, match: "not_found" });
});

test("a complete read failure propagates for the route to map", async () => {
  createRdpClient.mockReturnValue(fakeReader({ fail: () => new RdpError("ARCHIVE_INTEGRITY") }));
  await expect(getEventsIndex()).rejects.toMatchObject({ code: "ARCHIVE_INTEGRITY" });
});
