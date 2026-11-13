/** @jest-environment node */
import fs from "node:fs";
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { connectToDatabase } from "../libs/database";
import { parseCsoSetActivity, parseCsoEvent, parseCsoRevisions, parseCsoCatalogue } from "../libs/rdp/csoContract";
import { parseRelationshipSet } from "../libs/rdp/relationshipContract";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import {
  HPP_MEMBERSHIP, MEMBERSHIP_30D_MAX_OUTFALLS, getMembershipEventDetail, getMembershipEventHistory, getRdpMembershipWaterQualitySnapshot,
} from "../libs/rdp/csoMembership";
import { CSO_HISTORY_MAX_EVENTS, limitHistoryEvents } from "../libs/rdp/csoHistory";
import {
  getCsoMembershipMode, getPublicCsoEventDetail, getPublicCsoEventHistory, getPublicWaterQualitySnapshot,
} from "../libs/services/waterQualityService";
import { CURSOR, NOW, ST, asset, catalogue, event, eventsResponse, setActivityItem, setActivityResponse } from "../testUtils/rdpCsoFixtures";
import { relationshipSet, svt } from "../testUtils/rdpRelationshipFixtures";

jest.mock("server-only", () => ({}));
// A data cache that, like Next's, stores only resolved values.
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => {
    const store = new Map();
    (globalThis.__membershipCaches ??= []).push(store);
    return async (...args) => {
      const key = JSON.stringify(args);
      if (store.has(key)) return store.get(key);
      const value = await fn(...args);
      store.set(key, value);
      return value;
    };
  }),
}));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));

const clearCaches = () => (globalThis.__membershipCaches ?? []).forEach((store) => store.clear());
const EVENT_A = "cse_" + "a".repeat(24);

// ---- Fakes ----

let rdp;
let summary;
let csoData;
function mockMongo(water = { CSO_IDs: ["LEGACY1", "LEGACY2"], number_CSOs_per_km2: 0.02, number_upstream_CSOs: 7 }) {
  summary = { id: "wq-1", scrape_timestamp: new Date("2026-11-12T11:50:00Z"), water_quality: water };
  csoData = { aggregate: jest.fn(), find: jest.fn() };
  const waterQuality = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(summary) }) }) }) };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => (name === "csoData" ? csoData : waterQuality)) } });
}

// Activity pages for `items`, chained by cursor, `size` per page. `hours` must match the request.
function activityPages(items, { size = 100, hours = 48, total = items.length } = {}) {
  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += size) {
    const index = pages.length;
    const next = i + size < items.length ? `${CURSOR}${index + 1}` : null;
    pages.push(parseCsoSetActivity(setActivityResponse(items.slice(i, i + size), { total, nextCursor: next, hours }), "hpp-catchment", hours));
  }
  return pages;
}

function fakeClient({ set = relationshipSet(), setError = null, activity = {}, events = {}, assets = [], details = {}, revisions = {} } = {}) {
  return {
    getRiverRelationships: jest.fn(async (name) => {
      if (setError) throw setError;
      return parseRelationshipSet(set, name);
    }),
    getCsoSetActivity: jest.fn(async (name, { hours, cursor } = {}) => {
      const value = activity[hours];
      if (value instanceof Error) throw value;
      const pages = value ?? activityPages([], { hours });
      return pages[cursor ? Number(cursor.slice(CURSOR.length)) : 0];
    }),
    getCsoStatus: jest.fn(async () => { throw new Error("per-outfall status read"); }),
    getCsoEvents: jest.fn(async (id) => {
      const value = events[id];
      if (value instanceof Error) throw value;
      return value ?? { events: [], coverage: { status: "partial", collectedFrom: "2026-10-13T12:00:00.000Z", collectedTo: "2026-11-12T11:52:00.000Z", reportingCompleteness: "unverified", gaps: [] },
        requestAsOf: "2026-11-12T11:59:00.000Z", nextCursor: null };
    }),
    listCsoOutfalls: jest.fn(async () => parseCsoCatalogue(catalogue(assets))),
    getCsoEvent: jest.fn(async (id) => details[id]),
    getCsoEventRevisions: jest.fn(async (id) => revisions[id]),
  };
}

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  clearCaches();
  mockMongo();
  rdp = fakeClient();
  createRdpClient.mockImplementation(() => rdp);
  process.env = { ...originalEnv };
  delete process.env.RDP_CSO_SOURCE;
  delete process.env.RDP_CSO_MEMBERSHIP;
  delete process.env.RDP_CSO_HISTORY;
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

// ---- Relationship set contract ----

describe("relationship set contract", () => {
  test("keeps confirmed, candidate and catchment-only members distinct and counts the rest", () => {
    const parsed = parseRelationshipSet(relationshipSet({ confirmed: svt(2), candidate: svt(1, 10), catchmentOnly: svt(1, 20), ambiguous: svt(1, 30) }), "hpp-upstream-outfalls");
    expect(parsed.members.map((member) => [member.externalId, member.category])).toEqual([
      ["SVT00000", "confirmed"], ["SVT00001", "confirmed"], ["SVT00010", "candidate"], ["SVT00020", "catchment-only"]]);
    expect(parsed.members[0]).toMatchObject({ assetId: ST("SVT00000"), providerId: "severn-trent", sourceId: "storm-overflow-activity", routed: true });
    expect(parsed.scopes).toEqual({ confirmed: { count: 2, distinctLocations: 2 }, network: { count: 3, distinctLocations: 3 }, catchment: { count: 4, distinctLocations: 4 } });
    expect(parsed.categories).toMatchObject({ ambiguous: 1, excluded: 5 });
  });

  const broken = (mutate) => { const body = relationshipSet({ confirmed: svt(2), candidate: svt(1, 10) }); mutate(body); return body; };
  test.each([
    ["another schema", (body) => { body.schema = "rdp.river-tracer.upstream-relationships/v2"; }],
    ["another set", (body) => { body.setId = "dove-egginton"; }],
    ["a malformed version", (body) => { body.version = "bb422e98"; }],
    ["a scope count that disagrees with the listed relationships", (body) => { body.scopes[1].count += 1; }],
    ["a scope with different categories", (body) => { body.scopes[2].categories = ["confirmed", "candidate"]; }],
    ["a missing scope", (body) => { body.scopes.pop(); }],
    ["membership that is not the confirmed category", (body) => { body.membership.assetIds[0] = ST("SVT00010"); }],
    ["a membership count that disagrees", (body) => { body.membership.count = 5; }],
    ["an identity not built from its catalogue", (body) => { body.relationships[0].assetId = "severn-trent:other-source:SVT00000"; }],
    ["an unpinned provider", (body) => { body.relationships[0].providerId = "wessex-water"; }],
    ["a duplicated outfall", (body) => { body.relationships.push({ ...body.relationships[0] }); body.coverage.categories.confirmed += 1; }],
    ["an unknown category", (body) => { body.relationships[0].category = "probably"; }],
    ["a coverage denominator that does not add up", (body) => { body.coverage.catalogueAssets += 1; }],
    ["an approved review without approver", (body) => { delete body.review.approvedBy; }],
  ])("refuses %s", (_, mutate) => {
    expect(() => parseRelationshipSet(broken(mutate), "hpp-upstream-outfalls")).toThrow(expect.objectContaining({ code: "RESPONSE_CONTRACT_ERROR" }));
  });

  // Runs against the real committed RDP evidence when a local copy is pointed to (not committed here: 878 KB).
  const realSet = process.env.RDP_RELATIONSHIP_SET_FILE;
  (realSet ? test : test.skip)("accepts the approved HPP set published by RDP", () => {
    const parsed = parseRelationshipSet(JSON.parse(fs.readFileSync(realSet, "utf8")), "hpp-upstream-outfalls");
    expect(parsed.version).toBe(HPP_MEMBERSHIP.version);
    expect(parsed.scopes).toMatchObject({ confirmed: { count: 592 }, network: { count: 831 }, catchment: { count: 1514 } });
    expect(parsed.members).toHaveLength(1514);
    expect(parsed.members.filter((member) => member.category === "confirmed")).toHaveLength(592);
  });
});

// ---- Current status (map and counts) ----

describe("RDP membership snapshot", () => {
  const members = { confirmed: svt(4), candidate: svt(2, 100), catchmentOnly: svt(2, 200) };
  const walkItems = () => [
    setActivityItem("SVT00000", { status: { effectiveState: "spilling", reportedState: "spilling", statusStart: "2026-11-12T10:00:00Z" },
      events: [event("SVT00000", { lifecycle: "ongoing", endedAt: null, startedAt: "2026-11-12T10:00:00Z" })] }),
    setActivityItem("SVT00001", { events: [event("SVT00001", { startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z" })] }),
    setActivityItem("SVT00002", { status: { sourceUpdatedAt: "2026-11-12T09:00:00Z" } }),
    // SVT00003 is not in RDP's collection set.
    setActivityItem("SVT00100", { status: { effectiveState: "spilling", reportedState: "spilling" }, events: [event("SVT00100", { lifecycle: "ongoing", endedAt: null })] }),
    setActivityItem("SVT00101"),
    setActivityItem("SVT00200", { events: [event("SVT00200", { startedAt: "2026-11-12T05:00:00Z", endedAt: "2026-11-12T07:00:00Z" })] }),
    setActivityItem("SVT00201"),
    setActivityItem("SVT09999"),
  ];

  beforeEach(() => {
    rdp = fakeClient({ set: relationshipSet(members), activity: { 48: activityPages(walkItems(), { size: 3 }) } });
  });

  test("uses the confirmed scope as the population and keeps possible members separately labelled", async () => {
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.locations.map((row) => [row.id, row.status, row.statusReason])).toEqual([
      ["SVT00000", "active", "spilling"], ["SVT00001", "recent", "recently_stopped"], ["SVT00002", "unknown", "stale"], ["SVT00003", "unknown", "not_monitored"]]);
    expect(snapshot.locations[0]).toMatchObject({ assetId: ST("SVT00000"), externalId: "SVT00000", provider: "severn-trent",
      sourceId: "storm-overflow-activity", relationship: { category: "confirmed", reason: "BothMethodsNameAgrees" } });
    expect(snapshot.statusSummary).toEqual({ currentlySpilling: 1, recentlyStopped48h: 1, offline: 0, unknown: 2 });
    expect(snapshot.WaterQuality.CSOIds).toEqual(["SVT00000", "SVT00001", "SVT00002", "SVT00003"]);
    expect(snapshot.relatedLocations.categories).toEqual({
      candidate: { members: 2, currentlySpilling: 1, recentlyStopped48h: 0, offline: 0, unknown: 1 },
      "catchment-only": { members: 2, currentlySpilling: 0, recentlyStopped48h: 1, offline: 0, unknown: 1 },
    });
    expect(snapshot.relatedLocations.locations.map((row) => [row.id, row.relationship.category])).toEqual([["SVT00100", "candidate"], ["SVT00200", "catchment-only"]]);
    expect(snapshot.membership).toMatchObject({ source: "rdp", state: "available", relationshipSet: "hpp-upstream-outfalls", version: HPP_MEMBERSHIP.version,
      approval: "approved", network: { id: "orn-v2-gb" }, primaryScope: "confirmed", notUpstream: { ambiguous: 0, excluded: 5 } });
    expect(snapshot.health.cso).toMatchObject({ origin: "rdp", available: true, partial: false, read: { total: 8, outsideMembership: 1 } });
  });

  test("assessment inputs stay legacy and nothing reads csoData, CSO_IDs or per-outfall status", async () => {
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.WaterQuality).toMatchObject({ NumberCSOsPerKm2: 0.02, NumberUpstreamCSOs: 7 });
    expect(snapshot.WaterQuality.CSOIds).not.toContain("LEGACY1");
    expect(csoData.aggregate).not.toHaveBeenCalled();
    expect(rdp.getCsoStatus).not.toHaveBeenCalled();
    expect(rdp.getCsoEvents).not.toHaveBeenCalled();
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(3);
    expect(rdp.getRiverRelationships).toHaveBeenCalledWith("hpp-upstream-outfalls");
  });

  test("hundreds of members are one bounded walk with no 60-outfall cap", async () => {
    const confirmed = svt(600);
    rdp = fakeClient({ set: relationshipSet({ confirmed }), activity: { 48: activityPages(confirmed.map((id) => setActivityItem(id))) } });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.locations).toHaveLength(600);
    expect(snapshot.locations.filter((row) => row.statusReason === "status_not_read")).toHaveLength(0);
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(6);
    expect(rdp.getCsoStatus).not.toHaveBeenCalled();
    // A second request is served from the data cache.
    await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(rdp.getCsoSetActivity).toHaveBeenCalledTimes(6);
    expect(rdp.getRiverRelationships).toHaveBeenCalledTimes(1);
  });

  test("a walk that stops early leaves the rest unread, never clear or not monitored", async () => {
    const pages = activityPages(walkItems(), { size: 3 });
    rdp = fakeClient({ set: relationshipSet(members), activity: { 48: [pages[0], new RdpError("THROTTLED")] } });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.locations.map((row) => row.statusReason)).toEqual(["spilling", "recently_stopped", "stale", "status_not_read"]);
    expect(snapshot.health.cso).toMatchObject({ available: true, partial: true, read: { complete: false, stopReason: "page_failed" } });
  });

  test("a failed set read reports status unavailable over the RDP members, not the legacy list", async () => {
    rdp = fakeClient({ set: relationshipSet(members), activity: { 48: new RdpError("AUTHORIZATION_FAILED") } });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.locations.map((row) => [row.id, row.status, row.statusReason])).toEqual(
      members.confirmed.map((id) => [id, "unknown", "rdp_unavailable"]));
    expect(snapshot.statusSummary).toEqual({ currentlySpilling: null, recentlyStopped48h: null, offline: null, unknown: 4 });
    expect(snapshot.health.cso).toMatchObject({ available: false, rdpError: "AUTHORIZATION_FAILED" });
    expect(snapshot.membership).toMatchObject({ source: "rdp", state: "available" });
    expect(snapshot.WaterQuality.CSOIds).toEqual(members.confirmed);
  });

  test.each([
    ["the set is not published", { setError: new RdpError("RELATIONSHIPS_NOT_PUBLISHED", 404) }, "RELATIONSHIPS_NOT_PUBLISHED"],
    ["a different set version", { set: relationshipSet({ ...members, version: "f".repeat(64) }) }, "MEMBERSHIP_PIN_MISMATCH"],
    ["a different network release", { set: relationshipSet({ ...members, networkVersion: "e".repeat(64) }) }, "MEMBERSHIP_PIN_MISMATCH"],
    ["a different catalogue", { set: relationshipSet({ ...members, catalogueVersion: "d".repeat(64) }) }, "MEMBERSHIP_PIN_MISMATCH"],
    ["an unapproved set", { set: relationshipSet({ ...members, approval: "proposed" }) }, "MEMBERSHIP_NOT_APPROVED"],
    ["a malformed set", { setError: new RdpError("RESPONSE_CONTRACT_ERROR") }, "RESPONSE_CONTRACT_ERROR"],
  ])("when %s the population is unknown: no members, no counts, no fallback", async (_, options, code) => {
    rdp = fakeClient({ ...options, activity: { 48: activityPages(walkItems()) } });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.locations).toEqual([]);
    expect(snapshot.WaterQuality.CSOIds).toBeNull();
    expect(snapshot.statusSummary).toEqual({ currentlySpilling: null, recentlyStopped48h: null, offline: null, unknown: null });
    expect(snapshot.health.cso).toMatchObject({ available: false, rdpError: code });
    expect(snapshot.membership).toMatchObject({ source: "rdp", state: "unavailable", errorCode: code, pinnedVersion: HPP_MEMBERSHIP.version });
    expect(rdp.getCsoSetActivity).not.toHaveBeenCalled();
    expect(csoData.aggregate).not.toHaveBeenCalled();
  });

  test("a failed membership read is not cached; the next request recovers", async () => {
    rdp = fakeClient({ setError: new RdpError("THROTTLED"), activity: { 48: activityPages(walkItems()) } });
    expect((await getRdpMembershipWaterQualitySnapshot(NOW)).membership.state).toBe("unavailable");
    __resetRdpCsoStateForTests(); // a new client instance; the data cache is kept
    rdp = fakeClient({ set: relationshipSet(members), activity: { 48: activityPages(walkItems()) } });
    expect((await getRdpMembershipWaterQualitySnapshot(NOW)).membership.state).toBe("available");
  });

  test("an activity set from another provider is refused", async () => {
    const body = setActivityResponse([setActivityItem("SVT00000")]);
    body.meta.provider = "wessex-water";
    body.data[0].status.assetId = "wessex-water:storm-overflow-activity:SVT00000";
    rdp = fakeClient({ set: relationshipSet(members), activity: { 48: [parseCsoSetActivity(body, "hpp-catchment", 48)] } });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(snapshot.health.cso).toMatchObject({ available: false, rdpError: "RESPONSE_CONTRACT_ERROR" });
  });
});

// ---- The reversible switch ----

describe("RDP_CSO_MEMBERSHIP", () => {
  test("defaults to legacy; only exact values are accepted", () => {
    expect(getCsoMembershipMode({})).toBe("legacy");
    expect(getCsoMembershipMode({ RDP_CSO_MEMBERSHIP: "rdp" })).toBe("rdp");
    expect(getCsoMembershipMode({ RDP_CSO_MEMBERSHIP: "RDP" })).toBeNull();
  });

  test("legacy membership with RDP status keeps the CSO_IDs population and never reads relationships", async () => {
    process.env.RDP_CSO_SOURCE = "rdp";
    rdp.listCsoOutfalls.mockResolvedValue(parseCsoCatalogue(catalogue([])));
    const snapshot = await getPublicWaterQualitySnapshot();
    expect(snapshot.locations.map((row) => row.id)).toEqual(["LEGACY1", "LEGACY2"]);
    expect(snapshot.membership).toEqual({ source: "legacy", basis: "sewage-map-cso-ids", count: 2 });
    expect(rdp.getRiverRelationships).not.toHaveBeenCalled();
  });

  test("RDP membership with RDP status uses the relationship set", async () => {
    process.env.RDP_CSO_SOURCE = "rdp";
    process.env.RDP_CSO_MEMBERSHIP = "rdp";
    rdp = fakeClient({ set: relationshipSet({ confirmed: svt(2) }), activity: { 48: activityPages(svt(2).map((id) => setActivityItem(id))) } });
    const snapshot = await getPublicWaterQualitySnapshot();
    expect(snapshot.locations.map((row) => row.id)).toEqual(["SVT00000", "SVT00001"]);
    expect(snapshot.membership.source).toBe("rdp");
  });

  test("RDP membership with legacy status keeps the legacy population and says why", async () => {
    process.env.RDP_CSO_MEMBERSHIP = "rdp";
    csoData.aggregate.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
    const snapshot = await getPublicWaterQualitySnapshot();
    expect(snapshot.locations.map((row) => row.id)).toEqual(["LEGACY1", "LEGACY2"]);
    expect(snapshot.membership).toEqual({ source: "legacy", basis: "sewage-map-cso-ids", count: 2, requested: "rdp", reason: "status_source_not_rdp" });
    expect(rdp.getRiverRelationships).not.toHaveBeenCalled();
  });

  test("an invalid value serves legacy membership", async () => {
    process.env.RDP_CSO_SOURCE = "rdp";
    process.env.RDP_CSO_MEMBERSHIP = "maybe";
    rdp.listCsoOutfalls.mockResolvedValue(parseCsoCatalogue(catalogue([])));
    const snapshot = await getPublicWaterQualitySnapshot();
    expect(snapshot.membership.source).toBe("legacy");
    expect(rdp.getRiverRelationships).not.toHaveBeenCalled();
  });
});

// ---- Event history ----

describe("RDP membership event history", () => {
  const confirmed = svt(3);
  const set = relationshipSet({ confirmed, candidate: svt(1, 100) });
  const items = (hours) => activityPages([
    setActivityItem("SVT00000", { events: [event("SVT00000", { eventId: EVENT_A, startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z", revision: 2 })] }),
    setActivityItem("SVT00001", { events: null }),
    setActivityItem("SVT00100", { events: [event("SVT00100", { eventId: "cse_" + "b".repeat(24) })] }),
  ], { hours });

  test("24 hours is one set read over the confirmed members", async () => {
    rdp = fakeClient({ set, activity: { 24: items(24) } });
    const history = await getMembershipEventHistory("24h", NOW);
    expect(history.state).toBe("available");
    expect(history.outfalls.map((row) => [row.id, row.state])).toEqual([["SVT00000", "read"], ["SVT00001", "failed"], ["SVT00002", "not_monitored"]]);
    expect(history.events).toHaveLength(1);
    expect(history.events[0]).toMatchObject({ eventId: EVENT_A, outfallId: "SVT00000", assetId: ST("SVT00000"), revision: 2, display: "completed" });
    expect(history.outfalls[0]).toMatchObject({ relationship: { category: "confirmed" }, provider: "severn-trent", eventCount: 1 });
    expect(history.evidence.outfalls).toMatchObject({ members: 3, read: 1, failed: 1, notMonitored: 1 });
    expect(history.membership.version).toBe(HPP_MEMBERSHIP.version);
    expect(rdp.getCsoEvents).not.toHaveBeenCalled();
    expect(rdp.getCsoSetActivity).toHaveBeenCalledWith("hpp-catchment", expect.objectContaining({ hours: 24 }));
  });

  test("7 days reads the 168-hour set window", async () => {
    rdp = fakeClient({ set, activity: { 168: items(168) } });
    const history = await getMembershipEventHistory("7d", NOW);
    expect(history.window).toMatchObject({ key: "7d", hours: 168 });
    expect(history.readPolicy).toMatchObject({ source: "set_activity", set: "hpp-catchment" });
  });

  test("30 days reads a bounded number of outfalls, recent activity first, and reports the rest as not read", async () => {
    const many = svt(MEMBERSHIP_30D_MAX_OUTFALLS + 10);
    const recent = activityPages([setActivityItem(many.at(-1), { events: [event(many.at(-1))] })], { hours: 168, total: 1 });
    rdp = fakeClient({ set: relationshipSet({ confirmed: many }), activity: { 168: recent } });
    const history = await getMembershipEventHistory("30d", NOW);
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(MEMBERSHIP_30D_MAX_OUTFALLS);
    expect(rdp.getCsoEvents.mock.calls[0][0]).toBe(ST(many.at(-1)));
    expect(history.outfalls.filter((row) => row.state === "not_read")).toHaveLength(10);
    expect(history.outfalls.find((row) => row.state === "not_read")).toMatchObject({ notReadReason: "read_limit" });
    expect(history.evidence.outfalls.notRead).toBe(10);
    expect(history.readPolicy).toEqual({ limit: MEMBERSHIP_30D_MAX_OUTFALLS, prioritisedBy: "events_last_7d" });
  });

  test("a failed membership read makes history unavailable rather than falling back", async () => {
    rdp = fakeClient({ setError: new RdpError("RELATIONSHIPS_NOT_PUBLISHED", 404) });
    const history = await getMembershipEventHistory("24h", NOW);
    expect(history).toMatchObject({ state: "unavailable", errorCode: "RELATIONSHIPS_NOT_PUBLISHED", outfalls: [], events: [],
      membership: { state: "unavailable" } });
  });

  test("the public route switches with RDP_CSO_MEMBERSHIP, independently of RDP_CSO_SOURCE", async () => {
    process.env.RDP_CSO_HISTORY = "on";
    process.env.RDP_CSO_MEMBERSHIP = "rdp";
    rdp = fakeClient({ set, activity: { 24: items(24) } });
    const history = await getPublicCsoEventHistory("24h");
    expect(history).toMatchObject({ enabled: true, membership: { source: "rdp" }, eventTotals: { total: 1, returned: 1, truncated: false } });
    await expect(getPublicCsoEventHistory("24h", { outfall: "LEGACY1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("event detail is limited to confirmed members", async () => {
    const otherId = "cse_" + "b".repeat(24);
    const detail = (id, assetId) => parseCsoEvent({ data: { event: { ...event("x"), eventId: id, assetId },
      updatedAt: "2026-11-12T09:00:00Z", currentRevision: { revision: 1, changeReason: "created", recordedAt: "2026-11-12T09:00:00Z", claimId: "c",
        sourceFetchedAt: "2026-11-12T08:59:00Z", reconciliation: "automatic" }, openHolds: [], archive: { archived: false, generation: null } },
      meta: { retrievedAt: "2026-11-12T11:59:00Z" } }, id);
    const revisions = (id, assetId) => parseCsoRevisions({ data: [], meta: { eventId: id, assetId, currentRevision: 1, openHolds: [], nextCursor: null } }, id);
    rdp = fakeClient({ set, assets: [asset("SVT00000", { name: "Works A" })],
      details: { [EVENT_A]: detail(EVENT_A, ST("SVT00000")), [otherId]: detail(otherId, ST("SVT00100")) },
      revisions: { [EVENT_A]: revisions(EVENT_A, ST("SVT00000")), [otherId]: revisions(otherId, ST("SVT00100")) } });
    const result = await getMembershipEventDetail(EVENT_A);
    expect(result.outfall).toMatchObject({ id: "SVT00000", name: "Works A", relationship: { category: "confirmed" } });
    expect(result.event.outfallId).toBe("SVT00000");
    // A candidate member's event is not part of the confirmed HPP view.
    await expect(getMembershipEventDetail(otherId)).rejects.toMatchObject({ statusCode: 404 });
    process.env.RDP_CSO_HISTORY = "on";
    process.env.RDP_CSO_MEMBERSHIP = "rdp";
    await expect(getPublicCsoEventDetail(EVENT_A)).resolves.toMatchObject({ outfall: { id: "SVT00000" } });
  });
});

describe("history event limit", () => {
  const history = (count) => ({
    outfalls: [{ id: "A" }, { id: "B" }],
    events: Array.from({ length: count }, (_, i) => ({ eventId: `e${i}`, outfallId: i % 10 === 0 ? "B" : "A" })),
  });

  test("caps the newest events and reports the total", () => {
    const result = limitHistoryEvents(history(CSO_HISTORY_MAX_EVENTS + 50), undefined);
    expect(result.events).toHaveLength(CSO_HISTORY_MAX_EVENTS);
    expect(result.eventTotals).toEqual({ total: CSO_HISTORY_MAX_EVENTS + 50, returned: CSO_HISTORY_MAX_EVENTS, truncated: true });
  });

  test("an outfall filter is applied before the cap", () => {
    const result = limitHistoryEvents(history(CSO_HISTORY_MAX_EVENTS + 50), "B");
    expect(result.events.every((event) => event.outfallId === "B")).toBe(true);
    expect(result.eventTotals).toEqual({ total: 30, returned: 30, truncated: false });
    expect(result.outfallFilter).toBe("B");
  });

  test("an outfall outside the view is a 400", () => {
    expect(() => limitHistoryEvents(history(1), "Z")).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

test("legacy-membership history is unchanged apart from the membership label and limit", async () => {
  process.env.RDP_CSO_HISTORY = "on";
  rdp.getCsoEvents.mockResolvedValue(parseEventsPage());
  const result = await getPublicCsoEventHistory("24h");
  expect(result.membership).toEqual({ source: "legacy", basis: "sewage-map-cso-ids", count: 2 });
  expect(rdp.getRiverRelationships).not.toHaveBeenCalled();
});

function parseEventsPage() {
  return { ...eventsResponse("LEGACY1", []), events: [], coverage: { status: "unknown", collectedFrom: null, collectedTo: null, reportingCompleteness: "unverified", gaps: [] },
    requestAsOf: "2026-11-12T11:59:00.000Z", nextCursor: null };
}
