/** @jest-environment node */
import { unstable_cache } from "next/cache";
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { RDP_MEASUREMENTS } from "../libs/rdp/measurements";
import { compareTrentSeries } from "../libs/rdp/trentParity";
import { readTrentHistory, validateLegacySeries } from "../libs/rdp/trentSeries";
import { __resetRdpTrentStateForTests, RDP_TRENT_READ_DEADLINE_MS } from "../libs/rdp/trentSource";
import { buildOperationalHealth, getDisplayedHealthState } from "../libs/operationalHealth";
import {
  __resetTrentWeirsSnapshotCacheForTests,
  getLegacyTrentWeirsSnapshot,
  getTrentWeirsSnapshot,
} from "../libs/services/trentWeirsService";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const NOW = Date.parse("2026-10-24T10:00:00Z");
const STEP = 15 * 60 * 1000;
const KEYS = Object.keys(RDP_MEASUREMENTS);
const BASE = { "4009-level": 1.2, "4126-level": 2.1, "4007-level": 27.4, "4067-level": 30.5, "4074-level": 32.6, "4007-flow": 55 };
const iso = (time) => new Date(time).toISOString().replace(/\.000Z$/, "Z");
// i counts back from the newest reading; identical values on both sides unless overridden.
const valueAt = (key, i) => Number((BASE[key] - i * 0.003).toFixed(3));
const keyFor = (url) => `${url.match(/stations\/(\d+)/)[1]}-${url.includes("parameter=flow") ? "flow" : "level"}`;

function readings(key, { count = 673, ageMs = 0, skip = [] } = {}) {
  return Array.from({ length: count }, (_, i) => ({ i, time: NOW - ageMs - i * STEP }))
    .filter(({ i }) => !skip.includes(i))
    .map(({ i, time }) => ({ time, value: valueAt(key, i) }));
}

function legacyItems(key, options) {
  const measure = RDP_MEASUREMENTS[key].providerMeasureId;
  return readings(key, { count: 672, ...options }).map(({ time, value }) => ({
    "@id": `http://environment.data.gov.uk/flood-monitoring/data/readings/${measure}/${iso(time)}`,
    dateTime: iso(time), measure: `http://environment.data.gov.uk/flood-monitoring/id/measures/${measure}`, value,
  }));
}

function rdpRows(key, options) {
  const measure = RDP_MEASUREMENTS[key];
  return readings(key, options).reverse().map(({ time, value }) => ({
    observedAt: iso(time), value, unit: measure.unit, datum: measure.datum, quality: "Good",
    sourceId: "ea-flood-monitoring", providerMeasureId: measure.providerMeasureId,
  }));
}

const page = (id, data, nextCursor = null) => ({ data, meta: { measurementId: id, pageIntegrity: "verified", nextCursor } });
const idOf = (key) => RDP_MEASUREMENTS[key].measurementId;
const keyOf = (id) => KEYS.find((key) => idOf(key) === id);

let legacyBehaviour;
let rdpBehaviour;
let client;
let logs;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  __resetRdpTrentStateForTests();
  __resetTrentWeirsSnapshotCacheForTests();
  delete process.env.RDP_TRENT_SOURCE;
  legacyBehaviour = {};
  rdpBehaviour = {};
  logs = Object.fromEntries(["log", "warn", "error"].map((level) => [level, jest.spyOn(console, level).mockImplementation(() => {})]));
  Object.values(logs).forEach((spy) => spy.mockClear());
  global.fetch = jest.fn(async (url) => {
    const key = keyFor(url);
    const behaviour = legacyBehaviour[key];
    if (behaviour === "fail") return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ items: Array.isArray(behaviour) ? behaviour : legacyItems(key) }) };
  });
  client = { getObservations: jest.fn(async (id) => {
    const behaviour = rdpBehaviour[keyOf(id)];
    if (behaviour instanceof Error) throw behaviour;
    if (typeof behaviour === "function") return behaviour(id);
    return page(id, behaviour ?? rdpRows(keyOf(id)));
  }) };
  createRdpClient.mockReset().mockReturnValue(client);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const seriesOf = (snapshot) => Object.fromEntries(snapshot.health.series.map((entry) => [entry.key, entry]));
const loggedJson = (spy, prefix) => JSON.parse(spy.mock.calls.map(([line]) => line).findLast((line) => line.includes(prefix)).split(prefix)[1]);

describe("source mode selection", () => {
  test("default and explicit legacy never construct the RDP client", async () => {
    await getTrentWeirsSnapshot();
    process.env.RDP_TRENT_SOURCE = "legacy";
    await getTrentWeirsSnapshot();
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(12);
  });

  test("invalid mode is logged and serves legacy", async () => {
    process.env.RDP_TRENT_SOURCE = "RDP";
    const snapshot = await getTrentWeirsSnapshot();
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(snapshot.health.source).toBe("environment-agency-trent");
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("Invalid RDP_TRENT_SOURCE"));
  });

  test("the legacy reader used by gauge alerts ignores RDP_TRENT_SOURCE", async () => {
    process.env.RDP_TRENT_SOURCE = "rdp";
    const snapshot = await getLegacyTrentWeirsSnapshot();
    expect(client.getObservations).not.toHaveBeenCalled();
    expect(snapshot.health.source).toBe("environment-agency-trent");
  });

  test("RDP history is read through a 900s unstable_cache scope", () => {
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["rdp-trent-history-v1"], { revalidate: 900, tags: ["rdp-trent-history"] });
  });
});

describe("bounded paginated history", () => {
  test("follows opaque cursors within one 7-day window and returns newest-first readings", async () => {
    const rows = rdpRows("4009-level", { count: 700 });
    client.getObservations
      .mockResolvedValueOnce(page("ea-colwick-level", rows.slice(0, 400), "cursor_1"))
      .mockResolvedValueOnce(page("ea-colwick-level", rows.slice(400), null));

    const result = await readTrentHistory(client, "ea-colwick-level", new Date(NOW));

    expect(client.getObservations).toHaveBeenNthCalledWith(1, "ea-colwick-level",
      { from: "2026-10-17T10:00:00.000Z", to: "2026-10-24T10:00:00.000Z", limit: 1000, cursor: undefined });
    expect(client.getObservations).toHaveBeenNthCalledWith(2, "ea-colwick-level", expect.objectContaining({ cursor: "cursor_1" }));
    expect(result).toHaveLength(672);
    expect(result[0]).toEqual({ dateTime: "2026-10-24T10:00:00Z", value: 1.2 });
    expect(Date.parse(result[0].dateTime)).toBeGreaterThan(Date.parse(result[1].dateTime));
  });

  test("stops at the page bound instead of serving an incomplete series", async () => {
    client.getObservations.mockImplementation(async (id) => page(id, [], "more"));
    await expect(readTrentHistory(client, "ea-colwick-level", new Date(NOW))).rejects.toMatchObject({ code: "PAGINATION_LIMIT" });
    expect(client.getObservations).toHaveBeenCalledTimes(3);
  });

  test("rejects duplicate or reversed observation times across pages", async () => {
    const rows = rdpRows("4009-level", { count: 4 });
    client.getObservations
      .mockResolvedValueOnce(page("ea-colwick-level", rows.slice(0, 3), "c"))
      .mockResolvedValueOnce(page("ea-colwick-level", rows.slice(2), null));
    await expect(readTrentHistory(client, "ea-colwick-level", new Date(NOW))).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  });

  test("normalises offset timestamps to the existing EA dateTime format", async () => {
    client.getObservations.mockResolvedValueOnce(page("ea-colwick-level", [{ observedAt: "2026-10-24T10:45:00+01:00", value: -0.02 }]));
    await expect(readTrentHistory(client, "ea-colwick-level", new Date(NOW))).resolves.toEqual([{ dateTime: "2026-10-24T09:45:00Z", value: -0.02 }]);
  });
});

describe("rdp display mode", () => {
  beforeEach(() => { process.env.RDP_TRENT_SOURCE = "rdp"; });

  test("all fresh RDP series reproduce the legacy six-series contract exactly", async () => {
    delete process.env.RDP_TRENT_SOURCE;
    const legacy = await getTrentWeirsSnapshot();
    process.env.RDP_TRENT_SOURCE = "rdp";
    global.fetch.mockClear();

    const snapshot = await getTrentWeirsSnapshot();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(client.getObservations).toHaveBeenCalledTimes(6);
    expect(snapshot.stations).toEqual(legacy.stations);
    expect(snapshot.stations.map((station) => [station.stationId, Object.keys(station.measures)])).toEqual([
      [4009, ["level"]], [4126, ["level"]], [4007, ["level", "flow"]], [4067, ["level"]], [4074, ["level"]],
    ]);
    const colwick = snapshot.stations[0].measures.level;
    expect(colwick.readings).toHaveLength(672);
    expect(colwick.rateOfChangeHour).toBe(1.2);
    expect(colwick.rateOfChangeDay).toBe(28.8);
    expect(snapshot.stations[2].measures.flow.rateOfChangeHour).toBe(0);
    expect(snapshot).toMatchObject({ fallback: false, partial: false, health: { source: "river-data-platform-trent", state: "fresh" } });
    expect(snapshot.health.series.every((entry) => entry.origin === "rdp" && entry.state === "fresh")).toBe(true);
  });

  test("one failed RDP measurement falls back to its fresh complete legacy series only", async () => {
    rdpBehaviour["4007-flow"] = new RdpError("AUTHORIZATION_FAILED", 403);

    const snapshot = await getTrentWeirsSnapshot();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/stations/4007/readings?_sorted&_limit=672&parameter=flow"), { next: { revalidate: 900 } });
    expect(seriesOf(snapshot)["4007-flow"]).toMatchObject({ origin: "legacy", state: "fresh" });
    expect(seriesOf(snapshot)["4007-level"]).toMatchObject({ origin: "rdp" });
    expect(snapshot).toMatchObject({ fallback: true, partial: false, health: { state: "fallback" } });
    expect(JSON.stringify(snapshot)).not.toContain("AUTHORIZATION_FAILED");
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('"rdpError":"AUTHORIZATION_FAILED"'));
  });

  test("stale RDP is replaced by fresh legacy, and stale-only data is reported stale", async () => {
    rdpBehaviour["4009-level"] = rdpRows("4009-level", { ageMs: 2 * 60 * 60 * 1000 });
    rdpBehaviour["4126-level"] = rdpRows("4126-level", { ageMs: 3 * 60 * 60 * 1000 });
    legacyBehaviour["4126-level"] = legacyItems("4126-level", { ageMs: 2 * 60 * 60 * 1000 });

    const snapshot = await getTrentWeirsSnapshot();

    expect(seriesOf(snapshot)["4009-level"]).toMatchObject({ origin: "legacy", state: "fresh" });
    expect(seriesOf(snapshot)["4126-level"]).toMatchObject({ origin: "legacy", state: "stale", ageSeconds: 7200 });
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 7200 });
  });

  test("legacy fallback is validated per series: wrong measure is rejected and the series is missing", async () => {
    rdpBehaviour["4007-flow"] = new RdpError("STORAGE_UNAVAILABLE", 503);
    legacyBehaviour["4007-flow"] = legacyItems("4007-flow").map((item) => ({ ...item, measure: item.measure.replace("4007-flow--i-15_min-m3_s", "4007-flow-logged-i-15_min-m3_s") }));

    const snapshot = await getTrentWeirsSnapshot();

    expect(snapshot.stations.find((station) => station.stationId === 4007).measures).toEqual({ level: expect.any(Object) });
    expect(seriesOf(snapshot)["4007-flow"]).toEqual({ key: "4007-flow", origin: null, state: "unavailable", observedAt: null, ageSeconds: null });
    expect(snapshot).toMatchObject({ fallback: true, partial: true, health: { state: "fallback" } });
  });

  test("last-known series ages into stale when both sources later fail", async () => {
    await getTrentWeirsSnapshot();
    jest.setSystemTime(NOW + 45 * 60 * 1000);
    rdpBehaviour["4074-level"] = new RdpError("QUERY_TIMEOUT", 504);
    legacyBehaviour["4074-level"] = "fail";

    const snapshot = await getTrentWeirsSnapshot();

    expect(seriesOf(snapshot)["4074-level"]).toMatchObject({ origin: "cache", state: "stale", ageSeconds: 2700 });
    expect(snapshot.health.state).toBe("stale");
  });

  test("a slow RDP read is abandoned at the per-series deadline", async () => {
    rdpBehaviour["4067-level"] = () => new Promise(() => {});

    const pending = getTrentWeirsSnapshot();
    await jest.advanceTimersByTimeAsync(RDP_TRENT_READ_DEADLINE_MS);
    const snapshot = await pending;

    expect(seriesOf(snapshot)["4067-level"]).toMatchObject({ origin: "legacy", state: "fresh" });
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('"rdpError":"TIMEOUT"'));
  });

  test("invalid RDP configuration keeps every series on fresh legacy fallback", async () => {
    createRdpClient.mockImplementation(() => { throw new RdpError("CONFIGURATION_ERROR"); });

    const snapshot = await getTrentWeirsSnapshot();

    expect(snapshot.health.series.every((entry) => entry.origin === "legacy")).toBe(true);
    expect(snapshot.health.state).toBe("fallback");
  });

  // Production 2026-11-12 23:52Z: Shardlow flow's newest EA reading was 38 min old, its peers 23 min.
  test("an EA-lagging series makes the whole snapshot stale, never fresh, without a fallback flag", async () => {
    const lag = 38 * 60 * 1000;
    rdpBehaviour["4007-flow"] = rdpRows("4007-flow", { ageMs: lag });
    legacyBehaviour["4007-flow"] = legacyItems("4007-flow", { ageMs: lag });

    const snapshot = await getTrentWeirsSnapshot();

    expect(seriesOf(snapshot)["4007-flow"]).toMatchObject({ origin: "rdp", state: "stale", ageSeconds: 2280 });
    expect(seriesOf(snapshot)["4009-level"]).toMatchObject({ origin: "rdp", state: "fresh" });
    expect(snapshot).toMatchObject({ fallback: false, partial: false, health: { state: "stale", ageSeconds: 2280 } });
  });

  test("throws when no series is available so the route serves its empty unavailable payload", async () => {
    KEYS.forEach((key) => { rdpBehaviour[key] = new RdpError("NETWORK_ERROR"); legacyBehaviour[key] = "fail"; });
    await expect(getTrentWeirsSnapshot()).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("shadow mode", () => {
  beforeEach(() => { process.env.RDP_TRENT_SOURCE = "shadow"; });

  test("serves the legacy result unchanged and logs timestamp-aligned parity", async () => {
    rdpBehaviour["4126-level"] = rdpRows("4126-level", { ageMs: STEP });

    const snapshot = await getTrentWeirsSnapshot();
    delete process.env.RDP_TRENT_SOURCE;
    __resetTrentWeirsSnapshotCacheForTests();
    const legacy = await getTrentWeirsSnapshot();

    expect(snapshot).toEqual(legacy);
    const report = loggedJson(logs.log, "RDP Trent shadow comparison ");
    expect(report.legacyState).toBe("fresh");
    const byKey = Object.fromEntries(report.series.map((entry) => [entry.key, entry]));
    expect(byKey["4009-level"]).toMatchObject({ status: "match", matched: 672, valueMismatches: 0, latestLagSeconds: 0, rates: { match: true } });
    // Shifted by one interval: equal observations at equal timestamps, but values shift by one index.
    expect(byKey["4126-level"]).toMatchObject({ status: "value_mismatch", latestLagSeconds: 900 });
  });

  test("an RDP failure is recorded without affecting the legacy response", async () => {
    KEYS.forEach((key) => { rdpBehaviour[key] = new RdpError("ARCHIVE_INTEGRITY", 500); });

    const snapshot = await getTrentWeirsSnapshot();

    expect(snapshot.health).toMatchObject({ source: "environment-agency-trent", state: "fresh" });
    expect(loggedJson(logs.log, "RDP Trent shadow comparison ").series.every((entry) => entry.status === "rdp_error" && entry.rdpError === "ARCHIVE_INTEGRITY")).toBe(true);
  });

  test("partial RDP publication is classified per series and never changes the legacy result", async () => {
    ["4126-level", "4067-level", "4074-level"].forEach((key) => { rdpBehaviour[key] = []; });
    rdpBehaviour["4007-flow"] = rdpRows("4007-flow", { count: 671, ageMs: STEP }).map((row, index, rows) => ({ ...row, value: valueAt("4007-flow", rows.length - index) }));

    const snapshot = await getTrentWeirsSnapshot();

    expect(snapshot.health).toMatchObject({ source: "environment-agency-trent", state: "fresh" });
    const byKey = Object.fromEntries(loggedJson(logs.log, "RDP Trent shadow comparison ").series.map((entry) => [entry.key, entry]));
    ["4126-level", "4067-level", "4074-level"].forEach((key) => expect(byKey[key]).toMatchObject({ status: "rdp_error", rdpError: "NO_OBSERVATIONS" }));
    expect(byKey["4007-flow"]).toMatchObject({ status: "lag", matched: 671, valueMismatches: 0, latestLagSeconds: 900 });
    expect(byKey["4009-level"]).toMatchObject({ status: "match" });
  });

  test("a legacy failure still fails exactly as legacy does", async () => {
    KEYS.forEach((key) => { legacyBehaviour[key] = "fail"; });
    await expect(getTrentWeirsSnapshot()).rejects.toMatchObject({ statusCode: 502 });
  });
});

describe("compareTrentSeries", () => {
  const legacyOf = (key, options) => legacyItems(key, options).map(({ dateTime, value }) => ({ dateTime, value }));
  const rdpOf = (key, options) => rdpRows(key, options).reverse().map(({ observedAt, value }) => ({ dateTime: observedAt, value }));
  const now = new Date(NOW);

  test("a full seven-day 672-point sample matches exactly", () => {
    expect(compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: legacyOf("4009-level"), rdpReadings: rdpOf("4009-level", { count: 672 }), now }))
      .toMatchObject({ status: "match", matched: 672, missingInRdp: 0, missingInLegacy: 0, latestLagSeconds: 0, legacyState: "fresh", rdpState: "fresh" });
  });

  test("RDP lag is reported separately from matched equal values", () => {
    const report = compareTrentSeries({ key: "4007-flow", measureType: "flow", legacyReadings: legacyOf("4007-flow"), rdpReadings: rdpOf("4007-flow", { count: 672 }).slice(2), now });
    expect(report).toMatchObject({ status: "lag", matched: 670, valueMismatches: 0, missingInRdp: 0, latestLagSeconds: 1800 });
  });

  test("gaps inside the overlap are counted; edges outside it are not", () => {
    const report = compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: legacyOf("4009-level", { skip: [5] }), rdpReadings: rdpOf("4009-level", { count: 600, skip: [7, 8] }), now });
    expect(report).toMatchObject({ status: "gaps", missingInRdp: 2, missingInLegacy: 1, valueMismatches: 0 });
  });

  test("value mismatches at equal timestamps are sampled", () => {
    const rdp = rdpOf("4009-level", { count: 672 });
    rdp[3] = { ...rdp[3], value: 1.192 };
    const report = compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: legacyOf("4009-level"), rdpReadings: rdp, now });
    expect(report).toMatchObject({ status: "value_mismatch", valueMismatches: 1, mismatchSamples: [{ dateTime: "2026-10-24T09:15:00.000Z", legacy: 1.191, rdp: 1.192 }] });
  });

  test("repeated instants are counted and classified instead of surfacing as lag", () => {
    const legacy = legacyOf("4009-level");
    // The scraper keeps both spellings of one instant when merging its S3 baseline by string.
    const doubled = [...legacy.slice(0, 3).map((reading) => ({ ...reading, dateTime: reading.dateTime.replace(":00Z", "Z") })), ...legacy]
      .sort((a, b) => Date.parse(b.dateTime) - Date.parse(a.dateTime)).slice(0, 672);
    const report = compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: doubled, rdpReadings: rdpOf("4009-level", { count: 672 }), now });
    expect(report).toMatchObject({ status: "duplicate_instants", legacyDuplicates: 3, rdpDuplicates: 0, matched: 669, valueMismatches: 0, missingInRdp: 0, latestLagSeconds: 0 });
  });

  test("a rate-only difference is not reported as lag when the newest observations agree", () => {
    const rdp = rdpOf("4009-level", { count: 672 });
    const legacy = legacyOf("4009-level").filter((_, index) => index !== 96 && index !== 97);
    const report = compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: legacy, rdpReadings: rdp.slice(0, 96), now });
    expect(report).toMatchObject({ latestLagSeconds: 0, valueMismatches: 0, missingInRdp: 0, missingInLegacy: 0 });
    expect(report.status).toBe("rate_mismatch");
  });

  test("gap samples name the missing observed instants", () => {
    const report = compareTrentSeries({ key: "4009-level", measureType: "level", legacyReadings: legacyOf("4009-level"), rdpReadings: rdpOf("4009-level", { count: 672, skip: [4] }), now });
    expect(report).toMatchObject({ status: "gaps", missingInRdp: 1, gapSamples: { missingInRdp: ["2026-10-24T09:00:00.000Z"], missingInLegacy: [] } });
  });

  test("missing sides and errors are classified", () => {
    expect(compareTrentSeries({ key: "k", measureType: "level", rdpError: "TIMEOUT", now })).toMatchObject({ status: "rdp_error", rdpState: "error" });
    expect(compareTrentSeries({ key: "k", measureType: "level", legacyReadings: legacyOf("4009-level"), now }).status).toBe("rdp_missing");
    expect(compareTrentSeries({ key: "k", measureType: "level", rdpReadings: rdpOf("4009-level"), now }).status).toBe("legacy_missing");
  });
});

describe("legacy fallback validation", () => {
  const measure = RDP_MEASUREMENTS["4009-level"];

  test("accepts a complete newest-first series for the exact provider measure", () => {
    expect(validateLegacySeries(legacyItems("4009-level", { count: 2 }), measure)).toEqual([
      { dateTime: "2026-10-24T10:00:00Z", value: 1.2 }, { dateTime: "2026-10-24T09:45:00Z", value: 1.197 },
    ]);
  });

  test.each([
    ["empty", []],
    ["another measure", legacyItems("4126-level", { count: 2 })],
    ["non-finite value", legacyItems("4009-level", { count: 2 }).map((item, i) => (i ? { ...item, value: "n/a" } : item))],
    ["suspect quality", legacyItems("4009-level", { count: 2 }).map((item) => ({ ...item, quality: "Suspect" }))],
    ["oldest first", legacyItems("4009-level", { count: 2 }).reverse()],
  ])("rejects the whole series: %s", (_, items) => {
    expect(validateLegacySeries(items, measure)).toBeNull();
  });
});

describe("operational health precedence", () => {
  test("fallback older than 30 minutes is stale; recent fallback stays fallback", () => {
    const fetchedAt = new Date(NOW);
    expect(buildOperationalHealth({ source: "s", generatedAt: new Date(NOW - 31 * 60000), fetchedAt, fallback: true }).state).toBe("stale");
    expect(buildOperationalHealth({ source: "s", generatedAt: new Date(NOW - 10 * 60000), fetchedAt, fallback: true }).state).toBe("fallback");
    expect(buildOperationalHealth({ source: "s", unavailable: true, fallback: true }).state).toBe("unavailable");
  });

  test("display-time state never shows an observation older than 30 minutes as fresh or fallback", () => {
    const at = (minutes) => new Date(NOW - minutes * 60000).toISOString();
    expect(getDisplayedHealthState({ state: "fresh", generatedAt: at(29) }, NOW)).toBe("fresh");
    expect(getDisplayedHealthState({ state: "fresh", generatedAt: at(31) }, NOW)).toBe("stale");
    expect(getDisplayedHealthState({ state: "fallback", generatedAt: at(31) }, NOW)).toBe("stale");
    expect(getDisplayedHealthState({ state: "unavailable", generatedAt: null }, NOW)).toBe("unavailable");
    expect(getDisplayedHealthState({ state: "fresh", generatedAt: null }, NOW)).toBe("fresh");
    expect(getDisplayedHealthState(null, NOW)).toBeNull();
  });

  test("legacy saved snapshot re-evaluates its health instead of keeping a fresh state", async () => {
    await getLegacyTrentWeirsSnapshot();
    jest.setSystemTime(NOW + 10 * 60000);
    global.fetch.mockRejectedValue(new Error("down"));
    expect((await getLegacyTrentWeirsSnapshot()).health.state).toBe("fallback");
    jest.setSystemTime(NOW + 45 * 60000);
    expect((await getLegacyTrentWeirsSnapshot()).health).toMatchObject({ state: "stale", ageSeconds: 2700 });
  });
});
