/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { __resetRdpLevelsStateForTests, LEVELS_READING_LIMIT, validateLegacyLevels } from "../libs/rdp/levelsSource";
import { __resetRdpTrentStateForTests } from "../libs/rdp/trentSource";
import { getLatestLevelsSnapshot, getLegacyLevelsSnapshot } from "../libs/services/levelsService";
import { getTrentWeirsSnapshot } from "../libs/services/trentWeirsService";
import { GET, revalidate } from "../app/api/levels/route";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const NOW = Date.parse("2026-10-24T10:00:00Z");
const STEP = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const S3_URL = "https://example.com/levels/latest.json";
const COLWICK = { measurementId: "ea-colwick-level", unit: "mASD", datum: "ASD", providerMeasureId: "4009-level-stage-i-15_min-mASD" };
const iso = (time) => new Date(time).toISOString().replace(/\.000Z$/, "Z");
// i counts back from the newest reading; identical values on both sides unless overridden.
const valueAt = (i) => Number((1.2 - i * 0.003).toFixed(3));

function series({ count, ageMs = 0, skip = [] }) {
  return Array.from({ length: count }, (_, i) => ({ i, time: NOW - ageMs - i * STEP }))
    .filter(({ i }) => !skip.includes(i));
}

function levelReadings(options = {}) {
  return series({ count: 480, ...options }).map(({ i, time }) => ({ reading_date: iso(time), reading_level: valueAt(i) }));
}

function rdpRows(options = {}) {
  return series({ count: 673, ...options }).reverse().map(({ i, time }) => ({
    observedAt: iso(time), value: valueAt(i), unit: COLWICK.unit, datum: COLWICK.datum, quality: "Good",
    sourceId: "ea-flood-monitoring", providerMeasureId: COLWICK.providerMeasureId,
  }));
}

const FORECAST = [
  { forecast_date: "2026-10-24T12:00:00Z", forecast_reading: 1.25 },
  { forecast_date: "2026-10-24T18:00:00Z", forecast_reading: 1.3 },
];

function s3Payload(overrides = {}) {
  return { model_date: new Date(NOW - 5 * 60 * 1000).toISOString(), level_readings: levelReadings(), forecast_readings: FORECAST, level_source: "flood-api", ...overrides };
}

const page = (data, nextCursor = null) => ({ data, meta: { measurementId: COLWICK.measurementId, pageIntegrity: "verified", nextCursor } });

let s3Behaviour;
let rdpBehaviour;
let client;
let logs;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  __resetRdpTrentStateForTests();
  __resetRdpLevelsStateForTests();
  delete process.env.RDP_LEVELS_SOURCE;
  delete process.env.RDP_TRENT_SOURCE;
  process.env.S3_LEVELS_URL = S3_URL;
  s3Behaviour = undefined;
  rdpBehaviour = undefined;
  logs = Object.fromEntries(["log", "warn", "error"].map((level) => [level, jest.spyOn(console, level).mockImplementation(() => {})]));
  global.fetch = jest.fn(async (url) => {
    if (url !== S3_URL) return { ok: true, json: async () => ({ items: [] }) };
    if (s3Behaviour === "fail") return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => s3Behaviour ?? s3Payload() };
  });
  client = { getObservations: jest.fn(async () => {
    if (rdpBehaviour instanceof Error) throw rdpBehaviour;
    return page(rdpBehaviour ?? rdpRows());
  }) };
  createRdpClient.mockReset().mockReturnValue(client);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete process.env.S3_LEVELS_URL;
});

const loggedJson = (spy, prefix) => JSON.parse(spy.mock.calls.map(([line]) => line).findLast((line) => line.includes(prefix)).split(prefix)[1]);
const s3Calls = () => global.fetch.mock.calls.filter(([url]) => url === S3_URL);

describe("source mode selection", () => {
  test("default and explicit legacy never construct the RDP client and keep the legacy result", async () => {
    const legacy = await getLegacyLevelsSnapshot();
    expect(await getLatestLevelsSnapshot()).toEqual(legacy);
    process.env.RDP_LEVELS_SOURCE = "legacy";
    expect(await getLatestLevelsSnapshot()).toEqual(legacy);

    expect(createRdpClient).not.toHaveBeenCalled();
    expect(legacy.health.source).toBe("scraper-levels");
    expect(legacy.level_data).toEqual(levelReadings());
    expect(legacy.forecast_data).toEqual(FORECAST);
  });

  test("invalid mode is logged and serves legacy", async () => {
    process.env.RDP_LEVELS_SOURCE = "RDP";
    const snapshot = await getLatestLevelsSnapshot();
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(snapshot.health.source).toBe("scraper-levels");
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("Invalid RDP_LEVELS_SOURCE"));
  });

  test("levels and Trent source keys are independent", async () => {
    process.env.RDP_TRENT_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health.source).toBe("scraper-levels");
    expect(client.getObservations).not.toHaveBeenCalled();

    delete process.env.RDP_TRENT_SOURCE;
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getTrentWeirsSnapshot()).health.source).toBe("environment-agency-trent");
    expect(client.getObservations).not.toHaveBeenCalled();
  });

  test("the route keeps its 900s cache and the legacy S3 read keeps its 900s fetch cache in rdp mode", async () => {
    process.env.RDP_LEVELS_SOURCE = "rdp";
    await getLatestLevelsSnapshot();
    expect(revalidate).toBe(900);
    expect(global.fetch).toHaveBeenCalledWith(S3_URL, { next: { revalidate: 900 } });
  });
});

describe("rdp display mode", () => {
  beforeEach(() => { process.env.RDP_LEVELS_SOURCE = "rdp"; });

  test("fresh RDP reproduces the legacy level_data contract and keeps legacy forecast_data", async () => {
    const legacy = await getLegacyLevelsSnapshot();

    const snapshot = await getLatestLevelsSnapshot();

    expect(client.getObservations).toHaveBeenCalledTimes(1);
    expect(client.getObservations).toHaveBeenCalledWith("ea-colwick-level", expect.objectContaining({ from: "2026-10-17T10:00:00.000Z", to: "2026-10-24T10:00:00.000Z" }));
    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.level_data).toEqual(legacy.level_data);
    expect(Object.keys(snapshot.level_data[0])).toEqual(["reading_date", "reading_level"]);
    expect(snapshot.forecast_data).toEqual(legacy.forecast_data);
    expect(snapshot.health).toMatchObject({
      source: "river-data-platform-levels", state: "fresh", generatedAt: "2026-10-24T10:00:00.000Z", ageSeconds: 0,
      observed: { origin: "rdp", state: "fresh", observedAt: "2026-10-24T10:00:00Z", ageSeconds: 0 },
      forecast: { source: "scraper-levels", state: "fresh", ageSeconds: 300 },
    });
  });

  test.each([
    ["403 wrong stage", new RdpError("AUTHORIZATION_FAILED", 403)],
    ["timeout", new RdpError("TIMEOUT")],
    ["archive integrity", new RdpError("ARCHIVE_INTEGRITY", 500)],
  ])("RDP outage (%s) falls back to the fresh complete legacy series", async (_, error) => {
    rdpBehaviour = error;

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toEqual(levelReadings());
    expect(snapshot.forecast_data).toEqual(FORECAST);
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "legacy", state: "fresh" }, forecast: { state: "fresh" } });
    expect(JSON.stringify(snapshot)).not.toContain(error.code);
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining(`"rdpError":"${error.code}"`));
  });

  test("an empty RDP history is treated as missing, not as an empty fresh series", async () => {
    rdpBehaviour = [];
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.health.observed).toMatchObject({ origin: "legacy", state: "fresh" });
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ rdpError: "NO_OBSERVATIONS" });
  });

  test("stale RDP is replaced by fresh legacy without mixing points", async () => {
    rdpBehaviour = rdpRows({ ageMs: 2 * HOUR });
    s3Behaviour = s3Payload({ level_readings: levelReadings({ count: 10 }) });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toEqual(levelReadings({ count: 10 }));
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "legacy" } });
  });

  test("when both sources are stale the newest is served and reported stale, never fallback", async () => {
    rdpBehaviour = rdpRows({ ageMs: 2 * HOUR });
    s3Behaviour = s3Payload({ level_readings: levelReadings({ ageMs: 3 * HOUR }) });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data[0]).toEqual({ reading_date: iso(NOW - 2 * HOUR), reading_level: 1.2 });
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 7200, observed: { origin: "rdp", state: "stale", ageSeconds: 7200 } });
  });

  test("partial or invalid legacy data is rejected as a whole series", async () => {
    rdpBehaviour = new RdpError("UPSTREAM_ERROR", 503);
    const rows = levelReadings();
    rows[5] = { reading_date: rows[5].reading_date, reading_level: "1.1" };
    s3Behaviour = s3Payload({ level_readings: rows });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toEqual([]);
    expect(snapshot.forecast_data).toEqual(FORECAST);
    expect(snapshot.health).toMatchObject({ state: "unavailable", observed: { origin: null, state: "unavailable" }, forecast: { state: "fresh" } });
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ legacyLevelsValid: false, origin: null });
  });

  test("forecast unavailable while RDP observations are healthy is reported separately", async () => {
    s3Behaviour = "fail";

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.forecast_data).toEqual([]);
    expect(snapshot.health).toMatchObject({ state: "fresh", observed: { origin: "rdp" }, forecast: { state: "unavailable", generatedAt: null } });
  });

  test("forecast and observation ages are independent: an old snapshot cannot hide behind future forecast dates", async () => {
    s3Behaviour = s3Payload({ model_date: new Date(NOW - 4 * HOUR).toISOString() });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.health).toMatchObject({ state: "fresh", forecast: { state: "stale", ageSeconds: 14400 } });
    expect(snapshot.forecast_data).toEqual(FORECAST);
  });

  test("a missing levels URL only removes the forecast", async () => {
    delete process.env.S3_LEVELS_URL;
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.health.forecast.state).toBe("unavailable");
  });

  test("last-known levels age into stale when both sources later fail", async () => {
    await getLatestLevelsSnapshot();
    rdpBehaviour = new RdpError("STORAGE_UNAVAILABLE", 503);
    s3Behaviour = s3Payload({ level_readings: [], forecast_readings: FORECAST });
    jest.setSystemTime(NOW + HOUR);

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 3600, observed: { origin: "cache", state: "stale" } });
  });

  test("invalid RDP configuration keeps observed levels on fresh legacy fallback", async () => {
    createRdpClient.mockImplementation(() => { throw new RdpError("CONFIGURATION_ERROR"); });
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "legacy" } });
  });

  test("throws when observed levels and forecast are both unavailable so the route serves its empty payload", async () => {
    rdpBehaviour = new RdpError("UPSTREAM_ERROR", 503);
    s3Behaviour = "fail";

    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");

    const payload = await (await GET()).json();
    expect(payload).toMatchObject({ ok: true, data: { level_data: [], forecast_data: [], health: { state: "unavailable" } } });
  });
});

describe("shadow mode", () => {
  beforeEach(() => { process.env.RDP_LEVELS_SOURCE = "shadow"; });

  test("serves the legacy result unchanged and logs timestamp-aligned parity", async () => {
    delete process.env.RDP_LEVELS_SOURCE;
    const legacy = await getLatestLevelsSnapshot();
    process.env.RDP_LEVELS_SOURCE = "shadow";

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot).toEqual(legacy);
    expect(client.getObservations).toHaveBeenCalledTimes(1);
    expect(loggedJson(logs.log, "RDP levels shadow comparison ")).toMatchObject({
      legacyState: legacy.health.state,
      series: { key: "4009-level", status: "match", matched: 480, valueMismatches: 0, missingInRdp: 0, missingInLegacy: 0, latestLagSeconds: 0 },
    });
  });

  test("different retrieval times are not conflicts: equal values match and lag is reported separately", async () => {
    rdpBehaviour = rdpRows({ ageMs: 2 * STEP }).map((row, index, rows) => ({ ...row, value: valueAt(rows.length - 1 - index + 2) }));

    await getLatestLevelsSnapshot();

    expect(loggedJson(logs.log, "RDP levels shadow comparison ").series).toMatchObject({
      status: "lag", matched: 478, valueMismatches: 0, latestLagSeconds: 1800,
    });
  });

  test("value mismatches and gaps at matching timestamps are reported", async () => {
    rdpBehaviour = rdpRows({ skip: [10] }).map((row) => row.observedAt === iso(NOW - 3 * STEP) ? { ...row, value: 9.99 } : row);

    await getLatestLevelsSnapshot();

    expect(loggedJson(logs.log, "RDP levels shadow comparison ").series).toMatchObject({
      status: "value_mismatch", valueMismatches: 1, missingInRdp: 1,
      mismatchSamples: [{ dateTime: "2026-10-24T09:15:00.000Z", legacy: valueAt(3), rdp: 9.99 }],
    });
  });

  test("an RDP failure is recorded without affecting the legacy response", async () => {
    rdpBehaviour = new RdpError("THROTTLED", 429);
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.health.source).toBe("scraper-levels");
    expect(snapshot.level_data).toEqual(levelReadings());
    expect(loggedJson(logs.log, "RDP levels shadow comparison ").series).toMatchObject({ status: "rdp_error", rdpError: "THROTTLED" });
  });

  test("a legacy failure still fails exactly as legacy does", async () => {
    s3Behaviour = "fail";
    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");
    expect(loggedJson(logs.log, "RDP levels shadow comparison ")).toMatchObject({ legacyState: "unavailable", series: { status: "legacy_missing" } });
  });
});

describe("rollback", () => {
  test("rdp → legacy → rdp switches only the served source, with no RDP state leaking into legacy", async () => {
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health.source).toBe("river-data-platform-levels");

    // Roll back while RDP is degraded and the scraper is the only source.
    process.env.RDP_LEVELS_SOURCE = "legacy";
    rdpBehaviour = new RdpError("ARCHIVE_INTEGRITY", 500);
    client.getObservations.mockClear();
    const rolledBack = await getLatestLevelsSnapshot();
    expect(rolledBack).toEqual(await getLegacyLevelsSnapshot());
    expect(client.getObservations).not.toHaveBeenCalled();

    // Rolling back does not hide a legacy outage behind earlier RDP data.
    s3Behaviour = "fail";
    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");

    s3Behaviour = undefined;
    rdpBehaviour = undefined;
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health).toMatchObject({ source: "river-data-platform-levels", state: "fresh" });
    expect(s3Calls().length).toBeGreaterThan(0);
  });
});

describe("legacy fallback validation", () => {
  test("accepts a complete newest-first series", () => {
    expect(validateLegacyLevels(levelReadings({ count: 2 }))).toEqual([
      { dateTime: "2026-10-24T10:00:00Z", value: 1.2 },
      { dateTime: "2026-10-24T09:45:00Z", value: 1.197 },
    ]);
  });

  test.each([
    ["empty", []],
    ["not an array", null],
    ["oldest first", levelReadings({ count: 2 }).reverse()],
    ["duplicate time", [levelReadings({ count: 1 })[0], levelReadings({ count: 1 })[0]]],
    ["non-finite level", [{ reading_date: "2026-10-24T10:00:00Z", reading_level: Number.NaN }]],
    ["bad date", [{ reading_date: "not a date", reading_level: 1 }]],
  ])("rejects the whole series when %s", (_, rows) => {
    expect(validateLegacyLevels(rows)).toBeNull();
  });
});
