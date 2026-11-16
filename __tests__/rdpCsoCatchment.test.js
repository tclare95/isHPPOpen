/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { connectToDatabase } from "../libs/database";
import { parseCsoCatalogue, parseCsoSetActivity, parseCsoSetSummary } from "../libs/rdp/csoContract";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import {
  CATCHMENT_MAX_PAGES, CATCHMENT_WALK_BUDGET_MS, compareWithLegacy, countLocations, getCatchmentMonitoring, readSetActivity, setReadSource, walkSetActivity,
} from "../libs/rdp/csoCatchment";
import { getPublicCsoCatchmentMonitoring, isCsoCatchmentEnabled } from "../libs/services/waterQualityService";
import calibration from "../libs/waterQualityCalibration.json";
import { CURSOR, NOW, asset, catalogue, event, setActivityItem, setActivityResponse, setSummaryResponse } from "../testUtils/rdpCsoFixtures";

jest.mock("server-only", () => ({}));
// A data cache that, like Next's, stores only resolved values.
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => {
    const store = new Map();
    (globalThis.__catchmentDataCaches ??= []).push(store);
    const cached = async (...args) => {
      const key = JSON.stringify(args);
      if (store.has(key)) return store.get(key);
      const value = await fn(...args);
      store.set(key, value);
      return value;
    };
    return cached;
  }),
}));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));

const clearDataCache = () => (globalThis.__catchmentDataCaches ?? []).forEach((store) => store.clear());

const cursorFor = (index) => `${CURSOR}${index}`;
const parse = (body) => parseCsoSetActivity(body, "hpp-catchment", 48);
const ids = (count, start = 0) => Array.from({ length: count }, (_, i) => `SVT${String(start + i).padStart(5, "0")}`);

// `pages` is a list of parsed pages or errors, served in cursor order.
let rdp;
function fakeClient({ pages = [], assets = null, catalogueError = null } = {}) {
  return {
    getCsoSetActivity: jest.fn(async (set, { cursor } = {}) => {
      const index = cursor ? Number(cursor.slice(CURSOR.length)) : 0;
      const value = typeof pages === "function" ? pages(index) : pages[index];
      if (value instanceof Error) throw value;
      return value;
    }),
    listCsoOutfalls: jest.fn(async () => {
      if (catalogueError) throw catalogueError;
      return parseCsoCatalogue(catalogue(assets ?? []));
    }),
  };
}

// Splits items into pages of `size` with chained cursors.
function pagesOf(items, { size = 100, total = items.length, ...options } = {}) {
  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += size) {
    const index = pages.length;
    const last = i + size >= items.length;
    pages.push(parse(setActivityResponse(items.slice(i, i + size), { total, nextCursor: last ? null : cursorFor(index + 1), ...options })));
  }
  return pages;
}

function mockMongo({ observations = [], status = [], fail = false, failStatus = false } = {}) {
  const chain = (rows, failing) => ({ sort: () => ({ limit: () => ({ toArray: async () => { if (failing) throw new Error("mongo down"); return rows; } }) }) });
  const collections = { waterQuality: { find: jest.fn(() => chain(observations, fail)) }, csoData: { find: jest.fn(() => chain(status, fail || failStatus)) } };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => collections[name]) } });
  return collections;
}

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  clearDataCache();
  rdp = fakeClient();
  createRdpClient.mockImplementation(() => rdp);
  mockMongo();
  process.env = { ...originalEnv };
  delete process.env.RDP_CSO_CATCHMENT;
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

describe("pagination", () => {
  test("walks every cursor page in order and reads the whole set", async () => {
    const members = ids(250);
    rdp = fakeClient({ pages: pagesOf(members.map((id) => setActivityItem(id))) });
    const walk = await walkSetActivity("hpp-catchment");
    expect(rdp.getCsoSetActivity.mock.calls.map(([, options]) => options.cursor)).toEqual([undefined, cursorFor(1), cursorFor(2)]);
    expect(rdp.getCsoSetActivity.mock.calls.every(([set, options]) => set === "hpp-catchment" && options.limit === 100 && options.hours === 48)).toBe(true);
    expect(walk).toMatchObject({ complete: true, total: 250, received: 250, missing: 0, pageCount: 3, stopReason: null });
  });

  test("a set membership change restarts the walk once from the first page", async () => {
    const members = ids(150);
    const good = pagesOf(members.map((id) => setActivityItem(id)));
    let stale = true;
    rdp = fakeClient({ pages: (index) => {
      if (index === 1 && stale) { stale = false; return new RdpError("CURSOR_STALE", 409); }
      return good[index];
    } });
    const walk = await walkSetActivity("hpp-catchment");
    expect(walk).toMatchObject({ complete: true, restarted: true, received: 150 });
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(4);
  });

  test("a total that changes between pages is treated as a membership change", async () => {
    const first = pagesOf(ids(150).map((id) => setActivityItem(id)));
    const changed = pagesOf(ids(151).map((id) => setActivityItem(id)), { total: 151 });
    let calls = 0;
    rdp = fakeClient({ pages: (index) => (index === 1 && calls++ === 0 ? changed[1] : first[index]) });
    expect(await walkSetActivity("hpp-catchment")).toMatchObject({ complete: true, restarted: true });
  });

  test("stops at the page budget and counts the rest as not read", async () => {
    rdp = fakeClient({ pages: (index) => parse(setActivityResponse(ids(100, index * 100).map((id) => setActivityItem(id)), { total: 5000, nextCursor: cursorFor(index + 1) })) });
    const walk = await walkSetActivity("hpp-catchment");
    expect(walk).toMatchObject({ complete: false, stopReason: "page_budget", pageCount: CATCHMENT_MAX_PAGES, received: CATCHMENT_MAX_PAGES * 100,
      missing: 5000 - CATCHMENT_MAX_PAGES * 100 });
  });

  test("stops starting pages after the time budget", async () => {
    const pages = pagesOf(ids(300).map((id) => setActivityItem(id)));
    rdp = fakeClient({ pages: (index) => { if (index === 1) jest.setSystemTime(NOW.getTime() + CATCHMENT_WALK_BUDGET_MS + 1); return pages[index]; } });
    expect(await walkSetActivity("hpp-catchment")).toMatchObject({ complete: false, stopReason: "deadline", pageCount: 2, missing: 100 });
  });

  test("the same outfall on two pages is counted once and the walk is incomplete", async () => {
    const page1 = parse(setActivityResponse(["SVT1", "SVT2"].map((id) => setActivityItem(id)), { total: 3, nextCursor: cursorFor(1) }));
    const page2 = parse(setActivityResponse(["SVT2"].map((id) => setActivityItem(id)), { total: 3 }));
    rdp = fakeClient({ pages: [page1, page2] });
    expect(await walkSetActivity("hpp-catchment")).toMatchObject({ complete: false, duplicates: 1, received: 2, missing: 1 });
  });
});

describe("missing pages and unavailable sets", () => {
  test("a failed later page keeps what was read and reports the rest as not read", async () => {
    const pages = pagesOf(ids(250).map((id) => setActivityItem(id)));
    pages[1] = new RdpError("STORAGE_UNAVAILABLE", 503);
    rdp = fakeClient({ pages, assets: ids(250).map((id) => asset(id)) });
    const result = await getCatchmentMonitoring();
    expect(result).toMatchObject({ state: "partial", read: { complete: false, stopReason: "page_failed", errorCode: "STORAGE_UNAVAILABLE", received: 100, missing: 150 } });
    expect(result.summary.states.not_read).toBe(150);
    expect(result.summary.unknown).toBe(150);
    expect(result.summary.freshReports).toBe(100);
  });

  test("an incomplete walk is never written to the data cache, a complete one is reused", async () => {
    const good = pagesOf(ids(150).map((id) => setActivityItem(id)));
    let failSecond = true;
    rdp = fakeClient({ pages: (index) => (index === 1 && failSecond ? new RdpError("TIMEOUT") : good[index]) });
    expect((await getCatchmentMonitoring()).state).toBe("partial");
    failSecond = false;
    expect((await getCatchmentMonitoring()).read.complete).toBe(true);
    const calls = rdp.getCsoSetActivity.mock.calls.length;
    expect((await getCatchmentMonitoring()).read.complete).toBe(true);
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(calls);
  });

  test("a cached set read too old to present is read again, never shown as all stale", async () => {
    // Production served a 21-hour-old walk: every report was stale, so the section showed 0 spilling and 1,514 unknown.
    const spilling = { reportedState: "spilling", effectiveState: "spilling", statusStart: "2026-11-12T11:30:00Z" };
    const at = (time) => [parse(setActivityResponse([setActivityItem("A", { status: { ...spilling, sourceUpdatedAt: time, fetchedAt: time } })],
      { retrievedAt: time, from: "2026-11-10T00:00:00Z", to: time }))];
    let pages = at("2026-11-12T11:59:00Z");
    rdp = fakeClient({ pages: (index) => pages[index] });
    expect((await getCatchmentMonitoring()).summary.states.active).toBe(1);
    const calls = rdp.getCsoSetActivity.mock.calls.length;

    // The test data cache never expires, like an entry whose background refresh never finished.
    jest.setSystemTime(new Date("2026-11-12T13:00:00Z"));
    pages = at("2026-11-12T12:59:00Z");
    const later = await getCatchmentMonitoring();
    expect(rdp.getCsoSetActivity.mock.calls.length).toBeGreaterThan(calls);
    expect(later.window.retrievedAt).toBe("2026-11-12T12:59:00.000Z");
    expect(later.summary.states).toMatchObject({ active: 1, stale: 0 });

    // The same for the summary source.
    process.env.RDP_CSO_SET_SOURCE = "summary";
    let retrievedAt = "2026-11-12T12:59:00Z";
    const items = () => [setActivityItem("A", { status: { ...spilling, sourceUpdatedAt: retrievedAt, fetchedAt: retrievedAt } })];
    rdp.getCsoSetSummary = jest.fn(async () => parseCsoSetSummary(setSummaryResponse(items(), [], { retrievedAt, from: "2026-11-10T00:00:00Z" }), "hpp-catchment", 48));
    expect((await getCatchmentMonitoring()).summary.states.active).toBe(1);
    jest.setSystemTime(new Date("2026-11-12T15:00:00Z"));
    retrievedAt = "2026-11-12T14:59:00Z";
    const summarised = await getCatchmentMonitoring();
    expect(rdp.getCsoSetSummary).toHaveBeenCalledTimes(2);
    expect(summarised.summary.states).toMatchObject({ active: 1, stale: 0 });

    // A summary is one request, so a cached one is re-read after 10 minutes (the walk keeps its 20-minute limit).
    clearDataCache();
    await getCatchmentMonitoring();
    expect(rdp.getCsoSetSummary).toHaveBeenCalledTimes(3);
    jest.setSystemTime(new Date("2026-11-12T15:11:00Z"));
    retrievedAt = "2026-11-12T15:10:30Z";
    const refreshed = await getCatchmentMonitoring();
    expect(rdp.getCsoSetSummary).toHaveBeenCalledTimes(4);
    expect(refreshed.window.retrievedAt).toBe("2026-11-12T15:10:30.000Z");
  });

  test("concurrent requests share one walk", async () => {
    rdp = fakeClient({ pages: pagesOf(ids(150).map((id) => setActivityItem(id))) });
    await Promise.all([getCatchmentMonitoring(), getCatchmentMonitoring(), getCatchmentMonitoring()]);
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["SET_NOT_FOUND", 404, "set_not_enabled"],
    ["AUTHORIZATION_FAILED", 403, "not_authorised"],
    ["STORAGE_UNAVAILABLE", 503, "read_failed"],
    ["TIMEOUT", 0, "read_failed"],
  ])("a first-page %s makes the section unavailable without throwing", async (code, status, reason) => {
    rdp = fakeClient({ pages: [new RdpError(code, status)] });
    const result = await getCatchmentMonitoring();
    expect(result).toMatchObject({ state: "unavailable", reason, errorCode: code });
    expect(result).not.toHaveProperty("summary");
  });

  test("a set served for a different provider is not presented", async () => {
    const body = setActivityResponse([setActivityItem("SVT1")]);
    body.meta.provider = "wessex-water";
    body.data[0].status.assetId = "wessex-water:storm-overflow-activity:SVT1";
    body.meta.sourceId = "storm-overflow-activity";
    rdp = fakeClient({ pages: [parse(body)] });
    expect(await getCatchmentMonitoring()).toMatchObject({ state: "unavailable", errorCode: "RESPONSE_CONTRACT_ERROR" });
  });

  test("only reviewed sets can be requested", async () => {
    await expect(getCatchmentMonitoring("bath-avon")).rejects.toMatchObject({ statusCode: 400 });
    expect(rdp.getCsoSetActivity).not.toHaveBeenCalled();
  });

  test("per-outfall failures inside a page are unknown and mark the read partial", async () => {
    const items = [setActivityItem("SVT1"), setActivityItem("SVT2", { status: { status: "unavailable", reportedState: "unknown", effectiveState: "unknown",
      freshness: "unknown", sourceUpdatedAt: null, errorCode: "STORAGE_UNAVAILABLE" }, events: null })];
    rdp = fakeClient({ pages: [parse(setActivityResponse(items, { partial: true }))] });
    const result = await getCatchmentMonitoring();
    expect(result).toMatchObject({ state: "partial", read: { partialPages: 1, complete: true } });
    expect(result.summary.states).toMatchObject({ not_spilling: 1, unavailable: 1 });
    expect(result.summary.coverage.noCoverageReported).toBe(1);
  });

  test("a catalogue failure keeps the counts but not the locations", async () => {
    rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("SVT1")]))], catalogueError: new RdpError("TIMEOUT") });
    const result = await getCatchmentMonitoring();
    expect(result).toMatchObject({ state: "partial", read: { catalogueError: "TIMEOUT" }, selection: { catalogueMembers: null, notInCatalogue: null } });
    expect(result.summary.locations.all).toMatchObject({ outfalls: 1, locations: 0, withoutLocation: 1 });
  });

  test("reports the effective set size RDP serves next to the reviewed size and catalogue attribution", async () => {
    rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("SVT1"), setActivityItem("SVT2")]))],
      assets: [asset("SVT1", { sets: ["hpp-catchment"] }), asset("SVT2", { sets: ["hpp-catchment", "hpp-upstream"] }), asset("SVT3", { sets: ["hpp-upstream"] })] });
    const result = await getCatchmentMonitoring();
    expect(result.selection).toEqual({ reportedTotal: 2, matchesReviewed: false, catalogueMembers: 2, notInCatalogue: 0 });
    expect(result.set).toMatchObject({ key: "hpp-catchment", expectedOutfalls: 1514, relationshipVersion: "bb422e98d78ee1bc" });
  });
});

describe("evidence states, coverage and lag", () => {
  const spilling = { reportedState: "spilling", effectiveState: "spilling", statusStart: "2026-11-12T10:00:00Z" };

  test("classifies fresh spilling, recent, clear and every unknown reason separately", async () => {
    const items = [
      setActivityItem("A", { status: spilling, events: [event("A", { lifecycle: "ongoing", endedAt: null })] }),
      setActivityItem("B", { events: [event("B", { startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z" })] }),
      setActivityItem("C"),
      setActivityItem("D", { status: { reportedState: "offline", effectiveState: "unknown" } }),
      setActivityItem("E", { status: { freshness: "stale", sourceUpdatedAt: "2026-11-12T08:00:00Z", sourceAgeSeconds: 14400 } }),
      setActivityItem("F", { status: { status: "unresolved", reportedState: "unknown", effectiveState: "unknown" } }),
      setActivityItem("G", { status: { status: "no_observations", reportedState: "unknown", effectiveState: "unknown", freshness: "unknown", sourceUpdatedAt: null, sourceAgeSeconds: null } }),
      setActivityItem("H", { events: [event("H", { lifecycle: "unresolved", endedAt: null, boundaryProvenance: "end_not_reported", endNoLaterThan: "2026-11-12T09:00:00Z" })] }),
    ];
    rdp = fakeClient({ pages: [parse(setActivityResponse(items))] });
    const { summary } = await getCatchmentMonitoring();
    expect(summary.states).toEqual({ active: 1, recent: 1, not_spilling: 1, offline: 1, stale: 1, unresolved: 2, no_observations: 1, unavailable: 0, not_read: 0 });
    expect(summary).toMatchObject({ total: 8, freshReports: 3, unknown: 5 });
    expect(summary.events).toMatchObject({ outfallsWithEvents: 3, events: 3, ongoing: 1, unresolvedEnd: 1 });
  });

  test("unknown coverage is never collected, gaps are partial and only a gap-free window is collected throughout", async () => {
    const items = [
      setActivityItem("A"),
      setActivityItem("B", { cover: { status: "unknown", collectedFrom: null, collectedTo: null, reportingCompleteness: "unverified",
        gaps: [{ from: "2026-11-10T11:59:00Z", to: "2026-11-12T11:59:00Z", reason: "not_collected" }] } }),
      setActivityItem("C", { cover: { status: "partial", collectedFrom: "2026-11-12T00:00:00Z", collectedTo: "2026-11-12T11:52:00Z", reportingCompleteness: "unverified",
        gaps: [{ from: "2026-11-10T11:59:00Z", to: "2026-11-12T00:00:00Z", reason: "not_collected" }] } }),
    ];
    rdp = fakeClient({ pages: [parse(setActivityResponse(items))] });
    const { summary } = await getCatchmentMonitoring();
    expect(summary.coverage).toMatchObject({ collectedThroughout: 1, partlyCollected: 1, notCollected: 1, gapCount: 2, reportingCompleteness: "unverified",
      earliestCollectedFrom: "2026-11-10T11:45:00.000Z" });
  });

  test("source lag is reported and freshness is judged at request time, not when the walk was cached", async () => {
    rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("A", { status: { sourceAgeSeconds: 300 } }), setActivityItem("B", { status: { sourceAgeSeconds: 900 } })]))] });
    const first = await getCatchmentMonitoring();
    expect(first.summary.states.not_spilling).toBe(2);
    expect(first.summary.lag).toEqual({ sourceAgeSeconds: { median: 300, p90: 900, max: 900, samples: 2 }, readAgeSeconds: 60 });

    // 25 minutes later the cached walk is reused, but its 11:50 reports are now older than 30 minutes.
    const later = new Date(NOW.getTime() + 25 * 60000);
    const second = await getCatchmentMonitoring(undefined, later);
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(1);
    expect(second.summary.states).toMatchObject({ not_spilling: 0, stale: 2 });
    expect(second.summary.lag.readAgeSeconds).toBe(26 * 60);
  });
});

describe("outfalls versus distinct locations", () => {
  test("co-located outfalls are counted as outfalls and as one location; missing coordinates are never merged", async () => {
    const spill = { status: { reportedState: "spilling", effectiveState: "spilling" }, events: [event("x", { lifecycle: "ongoing", endedAt: null })] };
    const items = ["A", "B", "C", "D"].map((id) => setActivityItem(id, { ...spill, events: [event(id, { lifecycle: "ongoing", endedAt: null })] }));
    rdp = fakeClient({ pages: [parse(setActivityResponse(items))], assets: [
      asset("A", { latitude: 52.912345, longitude: -1.123456 }),
      asset("B", { latitude: 52.912345, longitude: -1.123456 }),
      asset("C", { latitude: null, longitude: null }),
      asset("D", { latitude: 52.95, longitude: -1.2 }),
    ] });
    const result = await getCatchmentMonitoring();
    expect(result.summary.locations.active).toEqual({ outfalls: 4, locations: 2, withoutLocation: 1, sharedLocations: 1, outfallsAtSharedLocations: 2 });
    const shares = Object.fromEntries(result.highlights.outfalls.map((row) => [row.externalId, row.sharesLocationWith]));
    expect(shares).toEqual({ A: 1, B: 1, C: null, D: 0 });
  });

  test("distinct coordinates a few metres apart remain separate locations", () => {
    const rows = [{ locationKey: "52.91234,-1.12346" }, { locationKey: "52.91237,-1.12346" }, { locationKey: null }, { locationKey: null }];
    expect(countLocations(rows)).toEqual({ outfalls: 4, locations: 2, withoutLocation: 2, sharedLocations: 0, outfallsAtSharedLocations: 0 });
  });

  test("the browser payload carries aggregates and a bounded highlight list, not every outfall", async () => {
    const members = ids(300);
    rdp = fakeClient({ pages: pagesOf(members.map((id) => setActivityItem(id, { status: { reportedState: "spilling", effectiveState: "spilling" } }))) });
    const result = await getCatchmentMonitoring();
    expect(result.summary.states.active).toBe(300);
    expect(result.highlights.outfalls).toHaveLength(50);
    expect(result.highlights.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/"rawCoverage"|"events":\[\{/);
  });
});

describe("comparison with legacy density and status history", () => {
  const observation = (observedAt, overrides = {}) => ({ scrape_timestamp: new Date(observedAt), water_quality: { number_CSOs_per_km2: 0.012, number_upstream_CSOs: 3, CSO_IDs: ["A", "B"], ...overrides } });

  test("aligns RDP evidence to each legacy observation time and compares listed outfalls like for like", async () => {
    const items = [
      setActivityItem("A", { events: [event("A", { startedAt: "2026-11-12T09:30:00Z", endedAt: "2026-11-12T10:30:00Z" })] }),
      setActivityItem("B", { events: [event("B", { eventId: "cse_" + "b".repeat(24), startedAt: "2026-11-12T09:00:00Z", endedAt: null, lifecycle: "unresolved",
        boundaryProvenance: "end_not_reported", endNoLaterThan: "2026-11-12T11:00:00Z" })] }),
      setActivityItem("C"),
    ];
    rdp = fakeClient({ pages: [parse(setActivityResponse(items))], assets: ["A", "B", "C"].map((id) => asset(id)) });
    const collections = mockMongo({
      observations: [observation("2026-11-12T10:00:00Z"), observation("2026-11-12T10:14:00Z"), observation("2026-11-12T11:15:00Z", { CSO_IDs: ["A"] })],
      status: [
        { DateScraped: new Date("2026-11-12T09:55:00Z"), attributes: { Id: "A", Status: 1 } },
        { DateScraped: new Date("2026-11-12T10:05:00Z"), attributes: { Id: "B", Status: 0 } },
        { DateScraped: new Date("2026-11-12T11:10:00Z"), attributes: { Id: "A", Status: 0 } },
      ],
    });
    const { comparison } = await getCatchmentMonitoring();
    expect(collections.waterQuality.find).toHaveBeenCalledWith({ scrape_timestamp: { $gte: new Date("2026-11-10T11:59:00Z"), $lte: new Date("2026-11-12T11:59:00Z") } }, expect.any(Object));
    expect(collections.csoData.find.mock.calls[0][0]["attributes.Id"]).toEqual({ $in: ["A", "B"] });
    expect(comparison).toMatchObject({ state: "available", alignment: "legacy_observation_time", interchangeable: false, observations: 2 });
    // One row per hour, at the last observation in that hour.
    expect(comparison.rows.map((row) => row.observedAt)).toEqual(["2026-11-12T10:14:00.000Z", "2026-11-12T11:15:00.000Z"]);
    expect(comparison.rows[0]).toMatchObject({
      legacy: { numberCSOsPerKm2: 0.012, numberUpstreamCSOs: 3 },
      members: { listed: 2, reporting: 2, spilling: 1, inRdpSet: 2, rdpCollected: 2, rdpSpilling: 1 },
      rdp: { collectedOutfalls: 3, spillingOutfalls: { lower: 1, upper: 2 }, spillingLocations: 1 },
    });
    expect(comparison.rows[1].rdp.spillingOutfalls).toEqual({ lower: 0, upper: 0 });
    // 10:14: A both spilling, B RDP end unreported. 11:15: A neither.
    expect(comparison.memberAgreement).toEqual({ bothSpilling: 1, legacyOnly: 0, rdpOnly: 0, neither: 1, rdpUncertain: 1, notComparable: 0 });
    expect(comparison.legacyStatusHistory).toEqual({ state: "available", records: 3 });
    expect(comparison.legacyThresholds).toMatchObject({ elevated: 0.0105, high: 0.0258, appliesTo: "legacy number_CSOs_per_km2 only" });
  });

  test("observations before RDP collection began are shown as not collected and not comparable", () => {
    const rows = [{ externalId: "A", locationKey: null, events: [], rawCoverage: { status: "partial", collectedFrom: "2026-11-12T16:41:00Z", collectedTo: "2026-11-13T10:00:00Z", gaps: [] } }];
    const result = compareWithLegacy({
      rows, from: "2026-11-11T10:00:00Z", to: "2026-11-13T10:00:00Z", provider: "severn-trent", sourceId: "storm-overflow-activity",
      observations: [{ observedAt: "2026-11-12T12:00:00.000Z", numberCSOsPerKm2: 0.03, numberUpstreamCSOs: 5, csoIds: ["A"] },
        { observedAt: "2026-11-12T18:00:00.000Z", numberCSOsPerKm2: 0, numberUpstreamCSOs: 0, csoIds: ["A"] }],
      statusHistory: [{ id: "A", scrapedAt: "2026-11-12T11:58:00.000Z", status: 1 }, { id: "A", scrapedAt: "2026-11-12T17:59:00.000Z", status: 0 }],
    });
    expect(result.rows.map((row) => row.rdp.collectedOutfalls)).toEqual([0, 1]);
    expect(result).toMatchObject({ rdpCollectedObservations: 1, memberAgreement: { notComparable: 1, neither: 1 } });
  });

  test("the gap awaiting RDP's next poll does not make the latest observation look uncollected", () => {
    const rawCoverage = { status: "partial", collectedFrom: "2026-11-12T00:00:00Z", collectedTo: "2026-11-12T10:40:00Z",
      gaps: [{ from: "2026-11-12T10:40:00Z", to: "2026-11-12T11:00:00Z", reason: "not_collected" }] };
    const base = { from: "2026-11-12T00:00:00Z", to: "2026-11-12T11:00:00Z", provider: "severn-trent", sourceId: "storm-overflow-activity", statusHistory: [],
      observations: [{ observedAt: "2026-11-12T10:52:00.000Z", numberCSOsPerKm2: 0, numberUpstreamCSOs: 0, csoIds: [] }] };
    const row = { externalId: "A", locationKey: null, events: [], rawCoverage };
    expect(compareWithLegacy({ ...base, rows: [{ ...row, asOf: "2026-11-12T11:00:00Z" }] }).rows[0].rdp.collectedOutfalls).toBe(1);
    // The same gap long before the answer is a real outage.
    expect(compareWithLegacy({ ...base, rows: [{ ...row, asOf: "2026-11-12T12:00:00Z" }] }).rows[0].rdp.collectedOutfalls).toBe(0);
  });

  test("a legacy status older than the freshness window does not describe the observation", () => {
    const rows = [{ externalId: "A", locationKey: null, events: [], rawCoverage: { status: "partial", collectedFrom: "2026-11-12T00:00:00Z", collectedTo: "2026-11-12T12:00:00Z", gaps: [] } }];
    const result = compareWithLegacy({ rows, from: "2026-11-12T00:00:00Z", to: "2026-11-12T12:00:00Z", provider: "severn-trent", sourceId: "storm-overflow-activity",
      observations: [{ observedAt: "2026-11-12T11:00:00.000Z", numberCSOsPerKm2: 0, numberUpstreamCSOs: 0, csoIds: ["A"] }],
      statusHistory: [{ id: "A", scrapedAt: "2026-11-12T10:00:00.000Z", status: 1 }] });
    expect(result.rows[0].members).toMatchObject({ reporting: 0, spilling: 0 });
    expect(result.memberAgreement.notComparable).toBe(1);
  });

  test("legacy per-outfall status history is optional: failed or retired, the density comparison still runs", async () => {
    const observations = [observation("2026-11-12T10:14:00Z")];
    for (const [options, state] of [[{ failStatus: true }, "unavailable"], [{ status: [] }, "none"]]) {
      __resetRdpCsoStateForTests();
      clearDataCache();
      rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("A")]))], assets: [asset("A")] });
      mockMongo({ observations, ...options });
      const { state: sectionState, comparison } = await getCatchmentMonitoring();
      expect(sectionState).toBe("available");
      expect(comparison).toMatchObject({ state: "available", observations: 1, legacyStatusHistory: { state, records: 0 }, memberAgreement: null });
      expect(comparison.rows[0]).toMatchObject({ legacy: { numberCSOsPerKm2: 0.012, numberUpstreamCSOs: 3 }, members: { listed: 2, reporting: null, spilling: null } });
    }
  });

  test("a legacy history failure leaves the monitoring summary intact", async () => {
    rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("A")]))] });
    mockMongo({ fail: true });
    const result = await getCatchmentMonitoring();
    expect(result.state).toBe("available");
    expect(result.comparison).toEqual({ state: "unavailable", interchangeable: false });
  });

  test("the calibrated legacy thresholds are unchanged", () => {
    expect(calibration.waterQuality).toMatchObject({ elevatedDensity: 0.0105, highDensity: 0.0258 });
  });
});

describe("flag", () => {
  test("is off unless exactly on, and then reads nothing", async () => {
    expect(isCsoCatchmentEnabled({})).toBe(false);
    expect(isCsoCatchmentEnabled({ RDP_CSO_CATCHMENT: "true" })).toBe(false);
    expect(await getPublicCsoCatchmentMonitoring()).toEqual({ enabled: false });
    expect(rdp.getCsoSetActivity).not.toHaveBeenCalled();
  });

  test("when on, serves the section", async () => {
    process.env.RDP_CSO_CATCHMENT = "on";
    rdp = fakeClient({ pages: [parse(setActivityResponse([setActivityItem("A")]))] });
    expect(await getPublicCsoCatchmentMonitoring()).toMatchObject({ enabled: true, state: "available", set: { key: "hpp-catchment" } });
    expect(rdp.getCsoSetActivity.mock.calls[0][0]).toBe("hpp-catchment");
  });
});

describe("set read source", () => {
  test("the one-request summary is the default; only RDP_CSO_SET_SOURCE=walk reads the pages", () => {
    const saved = process.env.RDP_CSO_SET_SOURCE;
    try {
      delete process.env.RDP_CSO_SET_SOURCE;
      expect(setReadSource()).toBe("summary");
      process.env.RDP_CSO_SET_SOURCE = "anything-else";
      expect(setReadSource()).toBe("summary");
      process.env.RDP_CSO_SET_SOURCE = "walk";
      expect(setReadSource()).toBe("walk");
    } finally {
      process.env.RDP_CSO_SET_SOURCE = saved;
    }
  });
});

describe("RDP set summary as the source (RDP_CSO_SET_SOURCE=summary)", () => {
  const spilling = { reportedState: "spilling", effectiveState: "spilling", statusStart: "2026-11-12T10:00:00Z" };
  const items = [
    setActivityItem("A", { status: spilling, events: [event("A", { lifecycle: "ongoing", endedAt: null })] }),
    setActivityItem("B", { events: [event("B", { startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z" })] }),
    setActivityItem("C"),
    setActivityItem("D", { status: { reportedState: "offline", effectiveState: "unknown" } }),
    setActivityItem("E", { status: { freshness: "stale", sourceUpdatedAt: "2026-11-12T08:00:00Z", sourceAgeSeconds: 14400 } }),
    setActivityItem("F", { status: { status: "no_observations", reportedState: "unknown", effectiveState: "unknown", freshness: "unknown", sourceUpdatedAt: null, sourceAgeSeconds: null } }),
    setActivityItem("G", { events: [event("G", { lifecycle: "unresolved", endedAt: null, boundaryProvenance: "end_not_reported", endNoLaterThan: "2026-11-12T09:00:00Z" })] }),
    setActivityItem("H", { status: { sourceUpdatedAt: "2026-11-12T11:45:00Z", sourceAgeSeconds: 900 } }),
    setActivityItem("I"),
    setActivityItem("J", { cover: { status: "partial", collectedFrom: "2026-11-11T09:00:00Z", collectedTo: "2026-11-12T11:52:00Z", reportingCompleteness: "unverified",
      gaps: [{ from: "2026-11-11T20:00:00Z", to: "2026-11-11T22:00:00Z", reason: "not_collected" }] } }),
    setActivityItem("K", { status: { status: "unavailable", reportedState: "unknown", effectiveState: "unknown", freshness: "unknown", sourceUpdatedAt: null, sourceAgeSeconds: null }, events: null }),
  ];
  // A and B are distinct; C and I share coordinates with A; J has none.
  const assets = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((id, i) => asset(id, {
    sets: ["hpp-catchment"], name: `Outfall ${id}`,
    ...(["C", "I"].includes(id) ? { latitude: 52.9, longitude: -1.2 } : id === "J" ? { latitude: null, longitude: null } : { latitude: 52 + i / 10, longitude: -1 - i / 10 }),
  }));
  const parseSummary = (body, hours = 48) => parseCsoSetSummary(body, "hpp-catchment", hours);
  const serveSummary = (body) => {
    process.env.RDP_CSO_SET_SOURCE = "summary";
    rdp.getCsoSetSummary = jest.fn(async () => (body instanceof Error ? (() => { throw body; })() : parseSummary(body)));
  };

  test("produces the same section as walking the activity pages with the catalogue, in one read and no catalogue read", async () => {
    // Make A share coordinates with C and I so a highlighted outfall's shared-location count is exercised.
    const located = assets.map((a) => (a.externalId === "A" ? { ...a, latitude: 52.9, longitude: -1.2 } : a));
    rdp = fakeClient({ pages: [parse(setActivityResponse(items))], assets: located });
    const walked = await getCatchmentMonitoring();
    expect(walked.source).toBe("walk");
    // Not a trivial match: the walk itself sees every state, the catalogue and the shared location.
    expect(walked.summary.states).toEqual({ active: 1, recent: 1, not_spilling: 4, offline: 1, stale: 1, unresolved: 1, no_observations: 1, unavailable: 1, not_read: 0 });
    expect(walked.summary.locations.all).toEqual({ outfalls: 11, locations: 8, withoutLocation: 1, sharedLocations: 1, outfallsAtSharedLocations: 3 });
    expect(walked.selection).toMatchObject({ catalogueMembers: 11, notInCatalogue: 0 });
    expect(walked.summary.coverage.partlyCollected).toBeGreaterThan(0);

    __resetRdpCsoStateForTests();
    clearDataCache();
    rdp = fakeClient({ assets: located });
    serveSummary(setSummaryResponse(items, located));
    const summarised = await getCatchmentMonitoring();

    expect(summarised.source).toBe("summary");
    expect(rdp.getCsoSetSummary).toHaveBeenCalledTimes(1);
    expect(rdp.getCsoSetSummary).toHaveBeenCalledWith("hpp-catchment", { hours: 48 });
    expect(rdp.getCsoSetActivity).not.toHaveBeenCalled();
    expect(rdp.listCsoOutfalls).not.toHaveBeenCalled();
    for (const key of ["state", "summary", "highlights", "comparison", "selection", "window"]) expect(summarised[key]).toEqual(walked[key]);
    expect(summarised.highlights.outfalls.find((o) => o.externalId === "A")).toMatchObject({ name: "Outfall A", sharesLocationWith: 2 });
    expect(summarised.read).toMatchObject({ complete: true, pages: 1, received: 11, missing: 0, catalogueError: null });
  });

  test("quiet outfalls arrive grouped and are classified at request time like any other report", async () => {
    serveSummary(setSummaryResponse(items, assets));
    const body = setSummaryResponse(items, assets);
    expect(body.data.outfalls.map((row) => row.status.assetId.slice(-1))).toEqual(["A", "B", "D", "E", "F", "G", "K"]);
    expect(body.data.quiet.map((group) => group.externalIds)).toEqual([["C", "I"], ["H"], ["J"]]);
    const walk = await readSetActivity("hpp-catchment", 48);
    expect(walk.items.map((item) => item.status.assetId.slice(-1))).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]);
    // An hour later every quiet report is older than the freshness window: stale, never still "not spilling".
    const { summary } = await getCatchmentMonitoring("hpp-catchment", new Date("2026-11-12T13:00:00Z"));
    expect(summary.states.not_spilling).toBe(0);
    expect(summary.states.stale).toBeGreaterThanOrEqual(4);
  });

  test("RDP failures map to the same unavailable reasons as the walk", async () => {
    for (const [error, reason] of [[new RdpError("AUTHORIZATION_FAILED", 403), "not_authorised"], [new RdpError("SET_NOT_FOUND", 404), "set_not_enabled"],
      [new RdpError("STORAGE_UNAVAILABLE", 503), "read_failed"]]) {
      __resetRdpCsoStateForTests();
      clearDataCache();
      serveSummary(error);
      expect(await getCatchmentMonitoring()).toMatchObject({ state: "unavailable", reason });
    }
  });

  test("a partial summary or an unavailable catalogue is reported, not hidden", async () => {
    serveSummary(setSummaryResponse(items, assets, { partial: true }));
    expect((await getCatchmentMonitoring()).read).toMatchObject({ partialPages: 1 });
    __resetRdpCsoStateForTests();
    clearDataCache();
    serveSummary(setSummaryResponse(items, assets, { catalogueState: "unavailable" }));
    const blind = await getCatchmentMonitoring();
    expect(blind).toMatchObject({ state: "partial", read: { catalogueError: "CATALOGUE_UNAVAILABLE" }, selection: { catalogueMembers: null, notInCatalogue: null } });
    expect(blind.summary.locations.all).toMatchObject({ locations: 0, withoutLocation: 11 });
  });

  test("the summary is cached and shared; the walk stays the default", async () => {
    serveSummary(setSummaryResponse(items, assets));
    await Promise.all([readSetActivity("hpp-catchment", 48), readSetActivity("hpp-catchment", 48)]);
    await readSetActivity("hpp-catchment", 48);
    expect(rdp.getCsoSetSummary).toHaveBeenCalledTimes(1);
    process.env.RDP_CSO_SET_SOURCE = "walk";
    rdp.getCsoSetActivity.mockResolvedValue(parse(setActivityResponse(items)));
    expect((await readSetActivity("hpp-catchment", 48)).source).toBeUndefined();
    expect(rdp.getCsoSetActivity).toHaveBeenCalled();
  });

  test("the summary contract rejects a set that is not exactly the whole set once", () => {
    const good = setSummaryResponse(items, assets);
    expect(() => parseSummary(good)).not.toThrow();
    const broken = [
      (b) => { b.meta.total += 1; },
      (b) => { b.data.quiet[0].externalIds.push("A"); b.data.quiet[0].outfalls += 1; b.meta.total += 1; },
      (b) => { b.data.quiet[0].freshness = "stale"; },
      (b) => { b.data.quiet[0].outfalls = 5; },
      (b) => { b.meta.windowHours = 24; },
      (b) => { b.data.outfalls[0].status.assetId = "wessex-water:overflows:A"; },
      (b) => { b.meta.catalogue.state = "Healthy"; },
    ];
    for (const breakIt of broken) {
      const body = JSON.parse(JSON.stringify(good));
      breakIt(body);
      expect(() => parseSummary(body)).toThrow(RdpError);
    }
  });
});
