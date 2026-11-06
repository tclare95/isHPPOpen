/** @jest-environment node */
import { unstable_cache } from "next/cache";
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import {
  HISTORY_RDP_READ_CONCURRENCY, PAST_MONTH_REVALIDATE_SECONDS, PAST_MONTH_TTL_SPREAD,
  __resetHistoryReaderForTests, describeHistoryError, getHistoryOverview, getMonthHistory, getYearHistory,
} from "../libs/history/historyService";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const NOW = Date.parse("2026-03-10T12:00:00Z");
const MIN = 60000;
const GOOD = JSON.stringify({ quality: "Good" });

// Serves a continuous 15-minute series at `level` over any requested window.
function fakeReader({ level = 1.3, fail = () => null } = {}) {
  return {
    getObservations: jest.fn(async (id, { from, to }) => {
      const failure = fail(from, to);
      if (failure) throw failure;
      const data = [];
      for (let t = Math.ceil(Date.parse(from) / (15 * MIN)) * 15 * MIN; t < Date.parse(to); t += 15 * MIN) {
        data.push({ observedAt: new Date(t).toISOString(), value: level, quality: GOOD, revision: 1 });
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

test("a month is read with 30-minute padding in UTC and summarised", async () => {
  const reader = fakeReader();
  createRdpClient.mockReturnValue(reader);
  const result = await getMonthHistory(2025, 7);
  expect(reader.getObservations).toHaveBeenCalledWith("ea-colwick-level", expect.objectContaining({
    from: "2025-06-30T22:30:00.000Z", to: "2025-07-31T23:30:00.000Z",
  }));
  expect(result).toMatchObject({ year: 2025, month: 7, label: "July 2025", measurement: { measurementId: "ea-colwick-level", thresholdMetres: 2.2 } });
  expect(result.summary).toMatchObject({ support: "full", unknownMs: 0, aboveMs: 0 });
  expect(result.readings).toHaveLength(31 * 96);
  expect(result.coverage.status).toBe("unknown");
});

test("the current month never requests future time and is in progress", async () => {
  const reader = fakeReader();
  createRdpClient.mockReturnValue(reader);
  const result = await getMonthHistory(2026, 3);
  expect(Date.parse(reader.getObservations.mock.calls[0][1].to)).toBeLessThanOrEqual(NOW);
  expect(result.period.inProgress).toBe(true);
  expect(result.summary.elapsedMs).toBe(NOW - Date.parse("2026-03-01T00:00:00Z"));
});

test("a year keeps readable months and marks failed ones instead of hiding them", async () => {
  createRdpClient.mockReturnValue(fakeReader({
    // April 2025 (BST) is read from 30 minutes before local midnight on 1 April.
    fail: (from) => (from === "2025-03-31T22:30:00.000Z" ? new RdpError("ARCHIVE_INTEGRITY", 503) : null),
  }));
  const result = await getYearHistory(2025);
  expect(result.months[3]).toEqual({ month: 4, status: "read_failed", error: "ARCHIVE_INTEGRITY" });
  expect(result.months.filter((month) => month.status === "available")).toHaveLength(11);
  expect(result.days).toHaveLength(365 - 30);
  expect(result.summary.elapsedMs).toBe(result.days.reduce((sum, day) => sum + day.elapsedMs, 0));
  expect(result).not.toHaveProperty("readings");
});

test("a year whose months all fail is an error, not an empty year", async () => {
  createRdpClient.mockReturnValue(fakeReader({ fail: () => new RdpError("STORAGE_UNAVAILABLE", 503) }));
  await expect(getYearHistory(2024)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
});

test("the overview covers every month from 2016 to now with seasonal context", async () => {
  createRdpClient.mockReturnValue(fakeReader({ level: 2.4 }));
  const overview = await getHistoryOverview();
  expect(overview.months).toHaveLength(10 * 12 + 3);
  expect(overview.monthsFailed).toBe(0);
  expect(overview.seasonal[10]).toMatchObject({ available: true, aboveShare: 1 });
  expect(overview.seasonal[10].referenceYears).toHaveLength(10);
  expect(overview.yearly.at(-1)).toMatchObject({ year: 2026, inProgress: true });
});

test("a missing RDP configuration is reported as unavailable, never as no data", async () => {
  createRdpClient.mockImplementation(() => { throw new RdpError("CONFIGURATION_ERROR"); });
  const error = await getMonthHistory(2024, 1).catch((caught) => caught);
  expect(describeHistoryError(error)).toMatchObject({ status: 503, reason: "unavailable", code: "CONFIGURATION_ERROR" });
});

test.each([
  ["ARCHIVE_INTEGRITY", 503, "integrity"],
  ["QUERY_TIMEOUT", 503, "temporary"],
  ["THROTTLED", 503, "temporary"],
  ["AUTHORIZATION_FAILED", 503, "unavailable"],
  ["RESPONSE_CONTRACT_ERROR", 502, "unreliable"],
  ["PAGINATION_LIMIT", 502, "unreliable"],
])("%s maps to %i %s", (code, status, reason) => {
  expect(describeHistoryError(new RdpError(code))).toMatchObject({ status, reason, code });
});

// Wraps a reader so every page read waits a tick, recording the peak number in flight.
function trackConcurrency(reader) {
  const stats = { inFlight: 0, peak: 0 };
  const inner = reader.getObservations;
  reader.getObservations = jest.fn(async (...args) => {
    stats.inFlight++;
    stats.peak = Math.max(stats.peak, stats.inFlight);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      return await inner(...args);
    } finally {
      stats.inFlight--;
    }
  });
  return stats;
}

test("RDP month reads are gated even when many callers start them at once", async () => {
  const reader = fakeReader();
  const stats = trackConcurrency(reader);
  createRdpClient.mockReturnValue(reader);
  // Background revalidation starts every stale month without settleAll's bound.
  await Promise.all(Array.from({ length: 24 }, (_, index) => getMonthHistory(2020 + Math.floor(index / 12), (index % 12) + 1)));
  expect(reader.getObservations).toHaveBeenCalledTimes(24);
  expect(stats.peak).toBe(HISTORY_RDP_READ_CONCURRENCY);
});

test("concurrent reads of the same month share one RDP read", async () => {
  const reader = fakeReader();
  trackConcurrency(reader);
  createRdpClient.mockReturnValue(reader);
  const [first, second] = await Promise.all([getMonthHistory(2024, 6), getMonthHistory(2024, 6)]);
  expect(reader.getObservations).toHaveBeenCalledTimes(1);
  expect(second.summary).toEqual(first.summary);
  await getMonthHistory(2024, 6);
  expect(reader.getObservations).toHaveBeenCalledTimes(2);
});

test("completed months spread their daily TTL without changing cache keys", () => {
  const past = unstable_cache.mock.calls
    .filter(([, keyParts]) => ["history-colwick-month-v2", "history-colwick-month-digest-v2"].includes(keyParts[0]));
  expect(past).toHaveLength(2 * PAST_MONTH_TTL_SPREAD);
  const ttls = [...new Set(past.map(([, , options]) => options.revalidate))].sort((a, b) => a - b);
  expect(ttls).toEqual(Array.from({ length: PAST_MONTH_TTL_SPREAD }, (_, hour) => PAST_MONTH_REVALIDATE_SECONDS + hour * 3600));
});

test("unexpected errors expose no internals", () => {
  const result = describeHistoryError(new Error("secret detail"));
  expect(result).toMatchObject({ status: 502, reason: "unreliable", code: "UNEXPECTED" });
  expect(JSON.stringify(result)).not.toContain("secret");
});
