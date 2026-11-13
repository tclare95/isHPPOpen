/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { __resetRdpLevelsStateForTests, LEVELS_READING_LIMIT } from "../libs/rdp/levelsSource";
import { __resetRdpTrentStateForTests } from "../libs/rdp/trentSource";
import { __resetLegacyLevelsStateForTests, EA_LEVELS_READ_DEADLINE_MS, getLatestLevelsSnapshot, getLegacyLevelsSnapshot } from "../libs/services/levelsService";
import { getTrentWeirsSnapshot } from "../libs/services/trentWeirsService";
import { GET, revalidate } from "../app/api/levels/route";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const NOW = Date.parse("2026-10-24T10:00:00Z");
const STEP = 15 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const EA_URL = "https://environment.data.gov.uk/flood-monitoring/id/stations/4009/readings?_sorted&_limit=672&parameter=level";
const LEGACY_S3_URL = "https://example.com/levels/latest.json";
const COLWICK = { measurementId: "ea-colwick-level", unit: "mASD", datum: "ASD", providerMeasureId: "4009-level-stage-i-15_min-mASD" };
const RETIRED_FORECAST = { source: "government-forecast", state: "unavailable", generatedAt: null, ageSeconds: null, reason: "retired" };
const iso = (time) => new Date(time).toISOString().replace(/\.000Z$/, "Z");
// i counts back from the newest reading; identical values on both sides unless overridden.
const valueAt = (i) => Number((1.2 - i * 0.003).toFixed(3));

function series({ count, ageMs = 0, skip = [] }) {
  return Array.from({ length: count }, (_, i) => ({ i, time: NOW - ageMs - i * STEP }))
    .filter(({ i }) => !skip.includes(i));
}

function levelData(options = {}) {
  return series({ count: 480, ...options }).map(({ i, time }) => ({ reading_date: iso(time), reading_level: valueAt(i) }));
}

function eaItems(options = {}) {
  return series({ count: 672, ...options }).map(({ i, time }) => ({
    dateTime: iso(time), value: valueAt(i), quality: "Good",
    measure: `http://environment.data.gov.uk/flood-monitoring/id/measures/${COLWICK.providerMeasureId}`,
  }));
}

function rdpRows(options = {}) {
  return series({ count: 673, ...options }).reverse().map(({ i, time }) => ({
    observedAt: iso(time), value: valueAt(i), unit: COLWICK.unit, datum: COLWICK.datum, quality: "Good",
    sourceId: "ea-flood-monitoring", providerMeasureId: COLWICK.providerMeasureId,
  }));
}

const page = (data, nextCursor = null) => ({ data, meta: { measurementId: COLWICK.measurementId, pageIntegrity: "verified", nextCursor } });

let eaBehaviour;
let rdpBehaviour;
let client;
let logs;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  __resetRdpTrentStateForTests();
  __resetRdpLevelsStateForTests();
  __resetLegacyLevelsStateForTests();
  delete process.env.RDP_LEVELS_SOURCE;
  delete process.env.RDP_TRENT_SOURCE;
  // Still set in deployed environments until removed; it must never be read.
  process.env.S3_LEVELS_URL = LEGACY_S3_URL;
  eaBehaviour = undefined;
  rdpBehaviour = undefined;
  logs = Object.fromEntries(["log", "warn", "error"].map((level) => [level, jest.spyOn(console, level).mockImplementation(() => {}).mockClear()]));
  global.fetch = jest.fn(async (url) => {
    if (url !== EA_URL) return { ok: true, json: async () => ({ items: [] }) };
    if (eaBehaviour === "fail") return { ok: false, json: async () => ({}) };
    if (eaBehaviour === "hang") return new Promise(() => {});
    return { ok: true, json: async () => ({ items: eaBehaviour ?? eaItems() }) };
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
const eaCalls = () => global.fetch.mock.calls.filter(([url]) => url === EA_URL);
const s3Calls = () => global.fetch.mock.calls.filter(([url]) => url === LEGACY_S3_URL);

describe("source mode selection", () => {
  test("default and explicit legacy serve direct EA and never construct the RDP client", async () => {
    const legacy = await getLegacyLevelsSnapshot();
    expect(await getLatestLevelsSnapshot()).toEqual(legacy);
    process.env.RDP_LEVELS_SOURCE = "legacy";
    expect(await getLatestLevelsSnapshot()).toEqual(legacy);

    expect(createRdpClient).not.toHaveBeenCalled();
    expect(legacy.level_data).toEqual(levelData());
    expect(legacy.forecast_data).toEqual([]);
    expect(legacy.health).toMatchObject({
      source: "environment-agency-levels", state: "fresh", generatedAt: "2026-10-24T10:00:00.000Z",
      observed: { origin: "ea", state: "fresh" }, forecast: RETIRED_FORECAST,
    });
  });

  test("invalid mode is logged and serves legacy", async () => {
    process.env.RDP_LEVELS_SOURCE = "RDP";
    const snapshot = await getLatestLevelsSnapshot();
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(snapshot.health.source).toBe("environment-agency-levels");
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("Invalid RDP_LEVELS_SOURCE"));
  });

  test("levels and Trent source keys are independent", async () => {
    process.env.RDP_TRENT_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health.source).toBe("environment-agency-levels");
    expect(client.getObservations).not.toHaveBeenCalled();

    delete process.env.RDP_TRENT_SOURCE;
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getTrentWeirsSnapshot()).health.source).toBe("environment-agency-trent");
    expect(client.getObservations).not.toHaveBeenCalled();
  });

  test.each(["legacy", "shadow", "rdp"])("%s mode never reads the scraper's levels/latest.json", async (mode) => {
    process.env.RDP_LEVELS_SOURCE = mode;
    rdpBehaviour = new RdpError("UPSTREAM_ERROR", 503);
    await getLatestLevelsSnapshot();
    expect(s3Calls()).toHaveLength(0);
  });

  test("the route keeps its 900s cache and the EA read keeps its 900s fetch cache", async () => {
    await getLatestLevelsSnapshot();
    expect(revalidate).toBe(900);
    expect(global.fetch).toHaveBeenCalledWith(EA_URL, { next: { revalidate: 900 } });
  });
});

describe("legacy (direct EA) mode", () => {
  test("a partial or wrong-measure EA series is rejected as a whole", async () => {
    const items = eaItems();
    items[5] = { ...items[5], measure: "http://environment.data.gov.uk/flood-monitoring/id/measures/4009-flow--i-15_min-m3_s" };
    eaBehaviour = items;
    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");
    expect(loggedJson(logs.warn, "EA levels unavailable ")).toEqual({ eaError: "EA_INVALID_SERIES" });
  });

  test("an EA outage serves this instance's last-known series as stale, never as fresh", async () => {
    await getLatestLevelsSnapshot();
    eaBehaviour = "fail";
    jest.setSystemTime(NOW + HOUR);

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toEqual(levelData());
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 3600, observed: { origin: "cache", state: "stale" } });
  });

  test("an EA outage with no last-known series makes the route serve its empty payload", async () => {
    eaBehaviour = "fail";
    const payload = await (await GET()).json();
    expect(payload).toMatchObject({ ok: true, data: { level_data: [], forecast_data: [], health: { source: "levels", state: "unavailable", forecast: RETIRED_FORECAST } } });
  });
});

describe("rdp display mode", () => {
  beforeEach(() => { process.env.RDP_LEVELS_SOURCE = "rdp"; });

  test("fresh RDP reproduces the level_data contract, makes no EA request and reports the retired government forecast", async () => {
    const snapshot = await getLatestLevelsSnapshot();

    expect(client.getObservations).toHaveBeenCalledTimes(1);
    expect(client.getObservations).toHaveBeenCalledWith("ea-colwick-level", expect.objectContaining({ from: "2026-10-17T10:00:00.000Z", to: "2026-10-24T10:00:00.000Z" }));
    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.level_data).toEqual(levelData());
    expect(Object.keys(snapshot.level_data[0])).toEqual(["reading_date", "reading_level"]);
    expect(snapshot.forecast_data).toEqual([]);
    expect(eaCalls()).toHaveLength(0);
    expect(snapshot.health).toMatchObject({
      source: "river-data-platform-levels", state: "fresh", generatedAt: "2026-10-24T10:00:00.000Z", ageSeconds: 0,
      observed: { origin: "rdp", state: "fresh", observedAt: "2026-10-24T10:00:00Z", ageSeconds: 0 },
      forecast: RETIRED_FORECAST,
    });
    expect(logs.warn).not.toHaveBeenCalled();
  });

  test("identical source data gives the same level_data from RDP and direct EA", async () => {
    const fromRdp = await getLatestLevelsSnapshot();
    process.env.RDP_LEVELS_SOURCE = "legacy";
    expect((await getLatestLevelsSnapshot()).level_data).toEqual(fromRdp.level_data);
  });

  test.each([
    ["403 wrong stage", new RdpError("AUTHORIZATION_FAILED", 403)],
    ["timeout", new RdpError("TIMEOUT")],
    ["archive integrity", new RdpError("ARCHIVE_INTEGRITY", 500)],
  ])("RDP outage (%s) falls back to one bounded direct-EA read", async (_, error) => {
    rdpBehaviour = error;

    const snapshot = await getLatestLevelsSnapshot();

    expect(eaCalls()).toHaveLength(1);
    expect(snapshot.level_data).toEqual(levelData());
    expect(snapshot.forecast_data).toEqual([]);
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "ea", state: "fresh" }, forecast: RETIRED_FORECAST });
    expect(JSON.stringify(snapshot)).not.toContain(error.code);
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ rdpError: error.code, eaError: null, origin: "ea" });
  });

  test("an empty RDP history is treated as missing, not as an empty fresh series", async () => {
    rdpBehaviour = [];
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.health.observed).toMatchObject({ origin: "ea", state: "fresh" });
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ rdpError: "NO_OBSERVATIONS" });
  });

  test("stale RDP is replaced by fresh EA without mixing points", async () => {
    rdpBehaviour = rdpRows({ ageMs: 2 * HOUR });
    eaBehaviour = eaItems({ count: 10 });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toEqual(levelData({ count: 10 }));
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "ea" } });
  });

  test("when both sources are stale the newest is served and reported stale, never fallback", async () => {
    rdpBehaviour = rdpRows({ ageMs: 2 * HOUR });
    eaBehaviour = eaItems({ ageMs: 3 * HOUR });

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data[0]).toEqual({ reading_date: iso(NOW - 2 * HOUR), reading_level: 1.2 });
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 7200, observed: { origin: "rdp", state: "stale", ageSeconds: 7200 } });
  });

  test("a hanging EA response is bounded by its deadline", async () => {
    rdpBehaviour = new RdpError("UPSTREAM_ERROR", 503);
    eaBehaviour = "hang";

    const assertion = expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");
    await jest.advanceTimersByTimeAsync(EA_LEVELS_READ_DEADLINE_MS);
    await assertion;
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ rdpError: "UPSTREAM_ERROR", eaError: "EA_TIMEOUT", origin: null });
  });

  test("an invalid EA series is rejected as a whole and the route serves its empty payload", async () => {
    rdpBehaviour = new RdpError("UPSTREAM_ERROR", 503);
    const items = eaItems();
    items[5] = { ...items[5], value: "not a number" };
    eaBehaviour = items;

    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");
    expect(loggedJson(logs.warn, "RDP levels display degraded ")).toMatchObject({ eaError: "EA_INVALID_SERIES", origin: null });

    const payload = await (await GET()).json();
    expect(payload).toMatchObject({ ok: true, data: { level_data: [], forecast_data: [], health: { state: "unavailable", forecast: RETIRED_FORECAST } } });
  });

  test("last-known levels age into stale when both sources later fail", async () => {
    await getLatestLevelsSnapshot();
    rdpBehaviour = new RdpError("STORAGE_UNAVAILABLE", 503);
    eaBehaviour = "fail";
    jest.setSystemTime(NOW + HOUR);

    const snapshot = await getLatestLevelsSnapshot();

    expect(snapshot.level_data).toHaveLength(LEVELS_READING_LIMIT);
    expect(snapshot.health).toMatchObject({ state: "stale", ageSeconds: 3600, observed: { origin: "cache", state: "stale" } });
  });

  test("invalid RDP configuration keeps observed levels on fresh EA fallback", async () => {
    createRdpClient.mockImplementation(() => { throw new RdpError("CONFIGURATION_ERROR"); });
    const snapshot = await getLatestLevelsSnapshot();
    expect(snapshot.health).toMatchObject({ state: "fallback", observed: { origin: "ea" } });
  });
});

describe("shadow mode", () => {
  beforeEach(() => { process.env.RDP_LEVELS_SOURCE = "shadow"; });

  test("serves the legacy (direct EA) result unchanged and logs timestamp-aligned parity", async () => {
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
    expect(snapshot.health.source).toBe("environment-agency-levels");
    expect(snapshot.level_data).toEqual(levelData());
    expect(loggedJson(logs.log, "RDP levels shadow comparison ").series).toMatchObject({ status: "rdp_error", rdpError: "THROTTLED" });
  });

  test("a legacy failure still fails exactly as legacy does", async () => {
    eaBehaviour = "fail";
    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");
    expect(loggedJson(logs.log, "RDP levels shadow comparison ")).toMatchObject({ legacyState: "unavailable", series: { status: "legacy_missing" } });
  });
});

describe("rollback", () => {
  test("rdp → legacy → rdp switches only the served source, with no RDP state leaking into legacy", async () => {
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health.source).toBe("river-data-platform-levels");

    // Roll back while RDP is degraded and direct EA is the only source.
    process.env.RDP_LEVELS_SOURCE = "legacy";
    rdpBehaviour = new RdpError("ARCHIVE_INTEGRITY", 500);
    client.getObservations.mockClear();
    const rolledBack = await getLatestLevelsSnapshot();
    expect(rolledBack).toEqual(await getLegacyLevelsSnapshot());
    expect(client.getObservations).not.toHaveBeenCalled();

    // Rolling back does not hide an EA outage behind earlier RDP data.
    __resetLegacyLevelsStateForTests();
    eaBehaviour = "fail";
    await expect(getLatestLevelsSnapshot()).rejects.toThrow("Failed to fetch levels data");

    eaBehaviour = undefined;
    rdpBehaviour = undefined;
    process.env.RDP_LEVELS_SOURCE = "rdp";
    expect((await getLatestLevelsSnapshot()).health).toMatchObject({ source: "river-data-platform-levels", state: "fresh" });
    expect(s3Calls()).toHaveLength(0);
  });
});
