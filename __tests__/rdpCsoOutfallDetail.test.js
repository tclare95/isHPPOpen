/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { connectToDatabase } from "../libs/database";
import { parseCsoCatalogue, parseCsoEvents, parseCsoStatus } from "../libs/rdp/csoContract";
import { parseRelationshipSet } from "../libs/rdp/relationshipContract";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import { CO_LOCATED_LIMIT, parseOutfallId } from "../libs/rdp/csoOutfallDetail";
import { getPublicCsoOutfallDetail } from "../libs/services/waterQualityService";
import { NOW, ST, asset, catalogue, event, eventsResponse, status, statusResponse } from "../testUtils/rdpCsoFixtures";
import { relationshipSet } from "../testUtils/rdpRelationshipFixtures";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn) => {
    const store = new Map();
    (globalThis.__outfallCaches ??= []).push(store);
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

const clearCaches = () => (globalThis.__outfallCaches ?? []).forEach((store) => store.clear());
const EVENT = (c) => `cse_${c.repeat(24)}`;

// Two monitors at one published location, one elsewhere, a candidate and a catalogue outfall outside the membership.
const ASSETS = [
  asset("SVT00001", { latitude: 52.95, longitude: -1.15, name: "Weir A" }),
  asset("SVT00002", { latitude: 52.95, longitude: -1.15, name: "Weir B" }),
  asset("SVT00003", { latitude: 52.8, longitude: -1.3, selected: false }),
  asset("SVT00010", { latitude: 52.7, longitude: -1.4 }),
  asset("SVT09999", { latitude: 52.95, longitude: -1.15, name: "Outside" }),
];
const SET = relationshipSet({ confirmed: ["SVT00001", "SVT00002", "SVT00003"], candidate: ["SVT00010"] });

let rdp;
let summary;
let csoRecords;
function mockMongo({ ids = ["SVT00001", "SVT00002"], records = [] } = {}) {
  summary = { id: "wq-1", scrape_timestamp: new Date("2026-11-12T11:50:00Z"), water_quality: { CSO_IDs: ids } };
  csoRecords = records;
  const waterQuality = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(summary) }) }) }) };
  const csoData = { aggregate: jest.fn(() => ({ toArray: async () => csoRecords.map((doc) => ({ _id: doc.attributes.Id, doc })) })) };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => (name === "csoData" ? csoData : waterQuality)) } });
}

function fakeClient({ set = SET, setError = null, statuses = {}, statusError = null, events = {} } = {}) {
  return {
    getRiverRelationships: jest.fn(async (name) => {
      if (setError) throw setError;
      return parseRelationshipSet(set, name);
    }),
    listCsoOutfalls: jest.fn(async () => parseCsoCatalogue(catalogue(ASSETS))),
    getCsoStatus: jest.fn(async (ids) => {
      if (statusError) throw statusError;
      return parseCsoStatus(statusResponse(ids.map((id) => statuses[id] ?? status(id.split(":")[2]))), ids);
    }),
    getCsoEvents: jest.fn(async (id) => {
      const value = events[id];
      if (value instanceof Error) throw value;
      return parseCsoEvents(value ?? eventsResponse(id.split(":")[2], []), id);
    }),
  };
}

const originalEnv = process.env;
function setEnv(values) {
  process.env = { ...originalEnv };
  for (const key of ["RDP_CSO_SOURCE", "RDP_CSO_MEMBERSHIP", "RDP_CSO_HISTORY", "RDP_RIVER_IMPACT"]) delete process.env[key];
  Object.assign(process.env, values);
}
const RDP_ON = { RDP_CSO_SOURCE: "rdp", RDP_CSO_MEMBERSHIP: "rdp", RDP_CSO_HISTORY: "on", RDP_RIVER_IMPACT: "on" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  clearCaches();
  mockMongo();
  rdp = fakeClient();
  createRdpClient.mockImplementation(() => rdp);
  setEnv(RDP_ON);
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

describe("outfall identity", () => {
  test.each([["bad id!"], ["../etc"], ["a".repeat(201)], [""], ["severn-trent::X"]])("an invalid id %j is 404", (id) => {
    expect(() => parseOutfallId(id)).toThrow(expect.objectContaining({ statusCode: 404 }));
  });

  test("resolves the canonical identity, published location and RDP collection state", async () => {
    const detail = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(detail.id).toBe(ST("SVT00001"));
    expect(detail.publicId).toBe("SVT00001");
    expect(detail.outfall).toMatchObject({ assetId: ST("SVT00001"), externalId: "SVT00001", provider: "severn-trent", providerLabel: "Severn Trent Water",
      sourceId: "storm-overflow-activity", name: "Weir A", selected: true, catalogueVersion: "v1" });
    expect(detail.outfall.coordinates).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    expect(detail.identity.state).toBe("resolved");
    expect(detail.relationship).toMatchObject({ basis: "rdp", category: "confirmed", primary: true, routed: true, relationshipSet: "hpp-upstream-outfalls" });
  });

  test("co-located monitors stay distinct: each resolves to itself and lists the other", async () => {
    const a = await getPublicCsoOutfallDetail(ST("SVT00001"));
    const b = await getPublicCsoOutfallDetail(ST("SVT00002"));
    expect(a.outfall.assetId).not.toBe(b.outfall.assetId);
    expect(a.coLocated.map((row) => [row.externalId, row.inScope])).toEqual([["SVT00002", true], ["SVT09999", false]]);
    expect(b.coLocated.map((row) => row.externalId)).toEqual(["SVT00001", "SVT09999"]);
    expect(a.coLocatedTotal).toBe(2);
    expect(CO_LOCATED_LIMIT).toBeGreaterThan(0);
  });

  test("a provider-only id resolves to the canonical identity", async () => {
    const detail = await getPublicCsoOutfallDetail("SVT00002");
    expect(detail.id).toBe(ST("SVT00002"));
    expect(detail.outfall.name).toBe("Weir B");
  });

  test("an outfall outside the membership, or an unknown one, is 404 (not a general RDP proxy)", async () => {
    await expect(getPublicCsoOutfallDetail(ST("SVT09999"))).rejects.toMatchObject({ statusCode: 404 });
    await expect(getPublicCsoOutfallDetail("SVT77777")).rejects.toMatchObject({ statusCode: 404 });
    await expect(getPublicCsoOutfallDetail("wessex-water:storm-overflow-activity:SVT00001")).rejects.toMatchObject({ statusCode: 404 });
    expect(rdp.getCsoStatus).not.toHaveBeenCalled();
  });

  test("an inferred candidate resolves but is labelled outside the confirmed membership", async () => {
    const detail = await getPublicCsoOutfallDetail(ST("SVT00010"));
    expect(detail.relationship).toMatchObject({ category: "candidate", primary: false, reviewed: false });
  });

  test("membership unavailable is 503, never a fallback to another list", async () => {
    rdp = fakeClient({ setError: new RdpError("UPSTREAM_UNAVAILABLE") });
    await expect(getPublicCsoOutfallDetail(ST("SVT00001"))).rejects.toMatchObject({ statusCode: 503 });
  });

  test("a catalogue failure leaves identity unavailable but still shows the member's own facts", async () => {
    rdp.listCsoOutfalls.mockRejectedValue(new RdpError("UPSTREAM_UNAVAILABLE"));
    const detail = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(detail.identity.state).toBe("unavailable");
    expect(detail.coLocated).toBeNull();
    expect(detail.outfall).toMatchObject({ assetId: ST("SVT00001"), receivingWatercourse: "RIVER TRENT", selected: null });
    expect(detail.status.state).toBe("available");
  });

  test("an unsupported window is 400", async () => {
    await expect(getPublicCsoOutfallDetail(ST("SVT00001"), { windowKey: "1y" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("current status", () => {
  test("a recently stopped, provider-reported spill is 'recent' with its times and source age", async () => {
    rdp = fakeClient({ events: { [ST("SVT00001")]: eventsResponse("SVT00001", [event("SVT00001")]) } });
    const { status: s } = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(s).toMatchObject({ source: "rdp", state: "available", location: { status: "recent", statusReason: "recently_stopped",
      latestEventStart: "2026-11-12T06:00:00.000Z", latestEventEnd: "2026-11-12T08:00:00.000Z" }, report: { sourceAgeSeconds: 600 } });
  });

  test("a stale report is unknown, never not spilling", async () => {
    rdp = fakeClient({ statuses: { [ST("SVT00001")]: status("SVT00001", { freshness: "stale", sourceUpdatedAt: "2026-11-12T09:00:00+00:00" }) } });
    const { status: s } = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(s.location).toMatchObject({ status: "unknown", statusReason: "stale" });
  });

  test("a status read failure is a section-level unavailable, not a failed page", async () => {
    rdp = fakeClient({ statusError: new RdpError("TIMEOUT") });
    const detail = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(detail.status).toEqual({ enabled: true, source: "rdp", state: "unavailable", errorCode: "TIMEOUT" });
    expect(detail.history.state).toBe("available");
  });

  test("legacy mode with every RDP flag off reads only Mongo and never RDP", async () => {
    setEnv({});
    mockMongo({ records: [{ DateScraped: new Date("2026-11-12T11:55:00Z"), attributes: { Id: "SVT00001", Status: 0, LatestEventEnd: "2026-11-09T08:00:00Z", ReceivingWaterCourse: "River Trent" }, geometry: { x: -1.15, y: 52.95 } }] });
    const detail = await getPublicCsoOutfallDetail("SVT00001");
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(detail).toMatchObject({ id: "SVT00001", publicId: "SVT00001", identity: { state: "not_read" }, relationship: { basis: "legacy" },
      history: { enabled: false }, connectivity: { impactEnabled: false, routed: null } });
    expect(detail.status).toMatchObject({ source: "legacy", state: "available", location: { status: "unknown", statusReason: "not_spilling_no_recent_event" } });
    expect(detail.outfall.coordinates).toEqual({ x: -1.15, y: 52.95 });
    await expect(getPublicCsoOutfallDetail("SVT00003")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("legacy status with no record is unknown", async () => {
    setEnv({});
    const detail = await getPublicCsoOutfallDetail("SVT00002");
    expect(detail.status.location).toMatchObject({ status: "unknown", statusReason: "no_status_record" });
  });
});

describe("recorded events", () => {
  test("keeps corrected, ongoing and unresolved events with their uncertainty, newest first", async () => {
    const id = ST("SVT00001");
    rdp = fakeClient({ events: { [id]: eventsResponse("SVT00001", [
      event("SVT00001", { eventId: EVENT("1"), startedAt: "2026-11-11T01:00:00Z", endedAt: "2026-11-11T03:00:00Z", revision: 3 }),
      event("SVT00001", { eventId: EVENT("2"), startedAt: "2026-11-11T09:00:00Z", endedAt: null, endNoLaterThan: "2026-11-11T12:00:00Z", lifecycle: "unresolved", boundaryProvenance: "end_not_reported" }),
      event("SVT00001", { eventId: EVENT("3"), startedAt: "2026-11-12T10:00:00Z", endedAt: null, lifecycle: "ongoing", boundaryProvenance: "provider_reported" }),
    ]) } });
    const { history } = await getPublicCsoOutfallDetail(id, { windowKey: "7d" });
    expect(history).toMatchObject({ enabled: true, state: "available", window: { key: "7d" }, evidence: { conclusion: "events" } });
    expect(history.events.map((e) => [e.eventId, e.display])).toEqual([[EVENT("3"), "ongoing"], [EVENT("2"), "unresolved"], [EVENT("1"), "completed"]]);
    expect(history.events[1]).toMatchObject({ endedAt: null, endNoLaterThan: "2026-11-11T12:00:00.000Z", durationMinutes: null, maxDurationMinutes: 180 });
    expect(history.events[2]).toMatchObject({ revision: 3, assetId: id });
    expect(history.events[0]).toMatchObject({ endedAt: null, elapsedMinutes: 119 });
  });

  test("an unselected outfall is 'not monitored', never 'no spills', and is not read", async () => {
    const { history } = await getPublicCsoOutfallDetail(ST("SVT00003"));
    expect(history.evidence.conclusion).toBe("not_monitored");
    expect(rdp.getCsoEvents.mock.calls.filter(([, opts]) => opts.limit === 200)).toHaveLength(0);
  });

  test("an events read failure is a section-level unavailable", async () => {
    rdp = fakeClient({ statuses: { [ST("SVT00001")]: status("SVT00001", { effectiveState: "unknown", reportedState: "unknown" }) },
      events: { [ST("SVT00001")]: new RdpError("UPSTREAM_UNAVAILABLE") } });
    const detail = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(detail.history).toMatchObject({ enabled: true, state: "unavailable", errorCode: "UPSTREAM_UNAVAILABLE" });
  });

  test("history and route flags off: sections disabled, nothing extra read", async () => {
    setEnv({ RDP_CSO_SOURCE: "rdp", RDP_CSO_MEMBERSHIP: "rdp" });
    const detail = await getPublicCsoOutfallDetail(ST("SVT00001"));
    expect(detail.history).toEqual({ enabled: false });
    expect(detail.connectivity).toEqual({ impactEnabled: false, routed: true });
    expect(rdp.getCsoEvents.mock.calls.filter(([, opts]) => opts.limit === 200)).toHaveLength(0);
  });

  test("legacy membership resolves only legacy list members, through the catalogue when RDP is in use", async () => {
    setEnv({ RDP_CSO_SOURCE: "rdp", RDP_CSO_HISTORY: "on" });
    const detail = await getPublicCsoOutfallDetail("SVT00002");
    expect(detail).toMatchObject({ id: ST("SVT00002"), relationship: { basis: "legacy", category: "legacy" }, outfall: { name: "Weir B" } });
    expect(detail.coLocated.map((row) => [row.externalId, row.inScope])).toEqual([["SVT00001", true], ["SVT09999", false]]);
    await expect(getPublicCsoOutfallDetail(ST("SVT00010"))).rejects.toMatchObject({ statusCode: 404 });
  });
});
