/** @jest-environment node */
// RDP-backed water-quality assessment reader, its source switch, the public route and the Mongo-free snapshot.
import { createRdpClient } from "../libs/rdp/client";
import { connectToDatabase } from "../libs/database";
import { parseCsoSetActivity } from "../libs/rdp/csoContract";
import { parseRelationshipSet } from "../libs/rdp/relationshipContract";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import { getRdpMembershipWaterQualitySnapshot } from "../libs/rdp/csoMembership";
import { ASSESSMENT_READ_HOURS, getRdpWaterQualityAssessment } from "../libs/rdp/waterQualityAssessment";
import { getLatestLevelsSnapshot } from "../libs/services/levelsService";
import { getPublicWaterQualityAssessment, getWaterQualityAssessmentHealth, getWaterQualityAssessmentMode } from "../libs/services/waterQualityAssessmentService";
import { GET as getAssessmentRoute } from "../app/api/waterquality/assessment/route";
import { event, setActivityItem, setActivityResponse } from "../testUtils/rdpCsoFixtures";
import { relationshipSet, svt } from "../testUtils/rdpRelationshipFixtures";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));
jest.mock("../libs/services/levelsService", () => ({ getLatestLevelsSnapshot: jest.fn() }));

const NOW = new Date("2026-11-16T18:00:00Z");
const READ_AT = "2026-11-16T17:59:00Z";
const FROM = "2026-11-09T17:59:00Z";
const ago = (hours) => new Date(NOW.getTime() - hours * 3600000).toISOString();
const COVER = { status: "partial", collectedFrom: FROM, collectedTo: "2026-11-16T17:50:00Z", reportingCompleteness: "unverified", gaps: [] };

let rdp;
let waterQuality;
function client({ set = relationshipSet({ confirmed: svt(20), candidate: svt(5, 100) }), setError = null, items, provider = "severn-trent" } = {}) {
  const page = setActivityResponse(items, { hours: ASSESSMENT_READ_HOURS, retrievedAt: READ_AT, from: FROM });
  page.meta.provider = provider;
  return {
    getRiverRelationships: jest.fn(async (name) => { if (setError) throw setError; return parseRelationshipSet(set, name); }),
    getCsoSetActivity: jest.fn(async (name, { hours }) => parseCsoSetActivity(page, name, hours)),
  };
}
// 16 confirmed members spilled in the last 48 h (Elevated), 4 quiet, and 5 candidate members that must be ignored.
const items = () => [
  ...svt(16).map((id) => setActivityItem(id, { events: [event(id, { startedAt: ago(10), endedAt: ago(9) })], cover: COVER })),
  ...svt(4, 16).map((id) => setActivityItem(id, { cover: COVER })),
  ...svt(5, 100).map((id) => setActivityItem(id, { status: { effectiveState: "spilling", reportedState: "spilling" }, events: [event(id, { lifecycle: "ongoing", endedAt: null, startedAt: ago(1) })], cover: COVER })),
];
const levels = (rise = 0) => ({ level_data: Array.from({ length: 121 }, (_, index) => ({ reading_date: new Date(NOW.getTime() - 20 * 60000 - index * 15 * 60000).toISOString(), reading_level: 1 + (index < 24 ? rise : 0) })),
  health: { source: "river-data-platform-levels" } });

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  rdp = client({ items: items() });
  createRdpClient.mockImplementation(() => rdp);
  getLatestLevelsSnapshot.mockResolvedValue(levels());
  waterQuality = { find: jest.fn(() => { throw new Error("Mongo waterQuality read"); }) };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => waterQuality) } });
  process.env = { ...originalEnv };
  delete process.env.RDP_WQ_ASSESSMENT;
  delete process.env.RDP_CSO_SET_SOURCE;
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

describe("RDP assessment reader", () => {
  test("assesses the confirmed scope from one 7-day set read and the level series, with attribution and method", async () => {
    const result = await getRdpWaterQualityAssessment({ hours: 24, now: NOW });
    expect(rdp.getCsoSetActivity).toHaveBeenCalledWith("hpp-catchment", expect.objectContaining({ hours: 168 }));
    expect(result).toMatchObject({ source: "rdp", version: "hpp-upstream-activity/v1",
      current: { level: "elevated", observedAt: new Date(READ_AT).toISOString(), factors: { cso: { members: 20, recent: { min: 16, max: 16 }, spillingNow: { min: 0 } }, runoff: { level: "lower" } } },
      evidence: { membership: { relationshipSet: "hpp-upstream-outfalls", members: 20, scope: "confirmed" }, read: { set: "hpp-catchment", complete: true }, reportingCompleteness: "unverified" },
      health: { source: "river-data-platform-wq-assessment", state: "fresh" },
      method: { bands: { elevated: { recent: 15 } } },
      explanation: { doesNotMean: expect.stringMatching(/not a measurement of bacteria/) } });
    expect(result.history.points.length).toBeGreaterThanOrEqual(24);
    expect(result.sources.map((source) => source.role)).toEqual(["storm_overflows", "upstream_membership", "river_levels"]);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  test("river conditions can raise it", async () => {
    getLatestLevelsSnapshot.mockResolvedValue(levels(0.4));
    expect((await getRdpWaterQualityAssessment({ now: NOW })).current).toMatchObject({ level: "high", factors: { runoff: { level: "high" } } });
  });

  test("an RDP failure is an unavailable assessment, never an error and never the legacy density", async () => {
    rdp = client({ items: items(), setError: Object.assign(new Error("x"), { code: "TIMEOUT" }) });
    getLatestLevelsSnapshot.mockResolvedValue(levels(0.12));
    const result = await getRdpWaterQualityAssessment({ hours: 120, now: NOW });
    expect(result.current.factors.cso).toMatchObject({ level: "unavailable", unavailableReason: "rdp_unavailable" });
    // River conditions alone may raise the indication ("at least"), but never produce "Lower".
    expect(result.current).toMatchObject({ level: "elevated", atLeast: true, partial: true });
    expect(result.health.state).toBe("unavailable");
    expect(result.history.points).toEqual([]);
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  test("a set read from another provider than the reviewed relationship is refused", async () => {
    rdp = client({ items: items(), provider: "wessex-water" });
    expect((await getRdpWaterQualityAssessment({ now: NOW })).evidence.errorCode).toBe("RESPONSE_CONTRACT_ERROR");
  });

  test("levels failing leaves the overflow factor and marks the result partial", async () => {
    getLatestLevelsSnapshot.mockRejectedValue(new Error("down"));
    expect((await getRdpWaterQualityAssessment({ now: NOW })).current).toMatchObject({ level: "elevated", partial: true, factors: { runoff: { level: "unavailable" } } });
  });
});

describe("RDP_WQ_ASSESSMENT switch", () => {
  test("parses modes; anything else is invalid", () => {
    expect(getWaterQualityAssessmentMode({})).toBe("legacy");
    expect(getWaterQualityAssessmentMode({ RDP_WQ_ASSESSMENT: "rdp" })).toBe("rdp");
    expect(getWaterQualityAssessmentMode({ RDP_WQ_ASSESSMENT: "RDP" })).toBeNull();
  });

  test("rdp: public assessment and health without Mongo", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    expect(await getPublicWaterQualityAssessment({ hours: 0, now: NOW })).toMatchObject({ mode: "rdp", source: "rdp", current: { level: "elevated" } });
    expect(await getWaterQualityAssessmentHealth(NOW)).toMatchObject({ source: "river-data-platform-wq-assessment" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  test("legacy and shadow serve the legacy density assessment; shadow attaches a labelled RDP comparison", async () => {
    const summary = { id: "wq", scrape_timestamp: new Date(NOW.getTime() - 5 * 60000), water_quality: { number_CSOs_per_km2: 0.03 } };
    const density = Array.from({ length: 12 }, (_, index) => ({ scrape_timestamp: new Date(NOW.getTime() - index * 15 * 60000), water_quality: { number_CSOs_per_km2: 0.03 } }));
    waterQuality.find = jest.fn((query) => ({
      sort: () => (query && Object.keys(query).length ? { toArray: async () => density.slice().reverse() } : { limit: () => ({ next: async () => summary }) }),
    }));
    const legacy = await getPublicWaterQualityAssessment({ now: NOW });
    expect(legacy).toMatchObject({ mode: "legacy", source: "legacy", version: "sewage-map-density/2026-08-31", current: { level: "high" }, history: null,
      legacyHistory: { route: "/api/waterquality/csodensity" } });
    expect(rdp.getCsoSetActivity).not.toHaveBeenCalled();
    process.env.RDP_WQ_ASSESSMENT = "shadow";
    expect(await getPublicWaterQualityAssessment({ now: NOW })).toMatchObject({ mode: "shadow", source: "legacy", current: { level: "high" },
      comparison: { legacy: { level: "high" }, rdp: { version: "hpp-upstream-activity/v1", level: "elevated" } } });
  });
});

describe("GET /api/waterquality/assessment", () => {
  const request = (query = "") => ({ nextUrl: new URL(`https://example.test/api/waterquality/assessment${query}`) });
  test("validates hours", async () => {
    expect((await getAssessmentRoute(request("?hours=48"))).status).toBe(400);
  });
  test("serves the assessment with a short shared cache", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    const response = await getAssessmentRoute(request("?hours=24"));
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toMatch(/s-maxage=300/);
    expect((await response.json()).data).toMatchObject({ source: "rdp", current: { level: "elevated" } });
  });
  test("an unavailable assessment is cached briefly", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    rdp = client({ items: items(), setError: new Error("x") });
    getLatestLevelsSnapshot.mockResolvedValue(levels());
    const response = await getAssessmentRoute(request());
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=60");
  });
});

describe("/api/waterquality snapshot with the RDP assessment", () => {
  test("never reads the Mongo waterQuality summary: legacy density fields are null and health is the RDP read's", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    rdp.getCsoSetActivity = jest.fn(async (name, { hours }) => parseCsoSetActivity(setActivityResponse(items(), { hours, retrievedAt: READ_AT, from: ago(48) }), name, hours));
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({ Id: null, ScrapeTimestamp: new Date(READ_AT).toISOString(), WaterQuality: { NumberCSOsPerKm2: null, NumberUpstreamCSOs: null },
      health: { source: "river-data-platform-cso", state: "fresh", cso: { origin: "rdp", available: true } } });
    expect(snapshot.locations).toHaveLength(20);
  });

  test("an RDP outage is still reported as unavailable without Mongo", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    rdp = client({ items: items(), setError: new Error("x") });
    const snapshot = await getRdpMembershipWaterQualitySnapshot(NOW);
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(snapshot.health).toMatchObject({ state: "unavailable", cso: { available: false } });
    expect(snapshot.WaterQuality.NumberCSOsPerKm2).toBeNull();
  });
});
