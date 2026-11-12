/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { connectToDatabase } from "../libs/database";
import {
  classifyRdpLocation, compareCsoLocation, eventWindow, getCsoShadowReport, getRdpCsoDetailsByIds,
  getRdpWaterQualitySnapshot, getShadowWaterQualitySnapshot, readRdpCsoEvidence, resolveCsoIdentities,
  __resetRdpCsoStateForTests, CSO_MAX_EVENT_READS,
} from "../libs/rdp/csoSource";
import {
  getLatestWaterQualitySnapshot, getPublicWaterQualitySnapshot, getPublicCsoDetailsByIds, getCsoSourceMode,
} from "../libs/services/waterQualityService";
import { ST, NOW } from "../testUtils/rdpCsoFixtures";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));

const iso = (value) => new Date(value).toISOString();
const asset = (externalId, overrides = {}) => ({ assetId: ST(externalId), provider: "severn-trent", sourceId: "storm-overflow-activity",
  externalId, latitude: 52.9, longitude: -1.2, receivingWatercourse: "River Trent", name: null, selected: true, sets: ["hpp-upstream"],
  catalogueVersion: "v1", ...overrides });
const status = (externalId, overrides = {}) => ({ assetId: ST(externalId), status: "available", reportedState: "not_spilling",
  effectiveState: "not_spilling", freshness: "fresh", statusStart: iso("2026-11-12T08:00:00Z"), sourceUpdatedAt: iso("2026-11-12T11:50:00Z"),
  sourceAgeSeconds: 600, fetchedAt: iso("2026-11-12T11:52:00Z"), lastSuccessfulPollAt: iso("2026-11-12T11:52:00Z"), reasons: [], errorCode: null, ...overrides });
const spilling = (externalId, overrides) => status(externalId, { reportedState: "spilling", effectiveState: "spilling", ...overrides });
const event = (overrides = {}) => ({ eventId: "cse_" + "a".repeat(24), startedAt: iso("2026-11-12T06:00:00Z"), endedAt: iso("2026-11-12T08:00:00Z"),
  endNoLaterThan: null, lifecycle: "completed", boundaryProvenance: "provider_reported", revision: 1, reconciliation: "resolved", heldClaims: 0, tier: "hot", ...overrides });
const events = (list, overrides = {}) => ({ events: list, coverage: { status: "partial", gaps: [] }, truncated: false, ...overrides });
const mapped = (id) => ({ state: "mapped", assetId: ST(id), asset: asset(id) });
const classify = (member, id = "SVT1") => classifyRdpLocation(id, { identity: mapped(id), ...member }, { now: NOW });

let rdp;
function fakeClient({ assets = [], statusRows = {}, eventsById = {}, healthById = {} } = {}) {
  return {
    listCsoOutfalls: jest.fn(async () => ({ assets, total: assets.length, catalogues: [{ provider: "severn-trent", sourceId: "storm-overflow-activity", state: "Healthy" }], nextCursor: null })),
    getCsoStatus: jest.fn(async (ids) => ({ rows: ids.map((id) => statusRows[id] ?? status(id.split(":")[2])), partial: false })),
    getCsoEvents: jest.fn(async (id) => ({ events: eventsById[id] ?? [], coverage: { status: "partial", gaps: [] }, nextCursor: null })),
    getCsoHealth: jest.fn(async (id) => healthById[id] ?? { assetId: id, selection: { state: "selected" }, catalogue: { state: "Healthy" }, coverageLast24h: { status: "partial", gaps: [] } }),
  };
}

const summary = (ids, scrape = "2026-11-12T11:50:00Z") => ({ id: "wq-1", scrape_timestamp: new Date(scrape),
  water_quality: { number_upstream_CSOs: "4", number_CSOs_per_km2: "0.04", CSO_IDs: ids } });
function mockMongo(latest, records = []) {
  const csoData = { aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(records) }) };
  const waterQuality = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(latest) }) }) }) };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => (name === "waterQuality" ? waterQuality : csoData)) } });
  return csoData;
}
const legacyRecord = (id, attributes, scraped = "2026-11-12T11:55:00Z") => ({ _id: id, doc: { DateScraped: new Date(scraped),
  attributes: { Id: id, LastUpdated: new Date("2026-11-12T11:50:00Z"), ReceivingWaterCourse: "River Trent", ...attributes }, geometry: { x: -1.2, y: 52.9 } } });

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  rdp = fakeClient();
  createRdpClient.mockImplementation(() => rdp);
  process.env = { ...originalEnv };
  delete process.env.RDP_CSO_SOURCE;
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

describe("status classification", () => {
  test("only fresh spilling evidence on both reported and effective state is active, timed from the source", () => {
    const location = classify({ status: spilling("SVT1"), events: events([event({ lifecycle: "ongoing", endedAt: null, startedAt: iso("2026-11-12T09:00:00Z") })]) });
    expect(location).toMatchObject({ status: "active", latestEventStart: "2026-11-12T09:00:00.000Z", latestEventEnd: null,
      eventDurationMinutes: 180, sourceUpdatedAt: "2026-11-12T11:50:00.000Z", observedAt: "2026-11-12T11:52:00.000Z", coordinates: { x: -1.2, y: 52.9 } });
    // Without event details the provider StatusStart is used, never the collection time.
    expect(classify({ status: spilling("SVT1"), events: null })).toMatchObject({ status: "active", latestEventStart: "2026-11-12T08:00:00.000Z" });
  });

  test.each([
    ["RDP stale", spilling("SVT1", { freshness: "stale" }), "stale"],
    ["older than 30 minutes by our clock", spilling("SVT1", { sourceUpdatedAt: iso("2026-11-12T11:29:00Z") }), "stale"],
    ["source time too far in the future", spilling("SVT1", { sourceUpdatedAt: iso("2026-11-12T12:06:00Z") }), "stale"],
    ["reported spilling, effective unknown", status("SVT1", { reportedState: "spilling", effectiveState: "unknown" }), "contradictory"],
    ["no observations", status("SVT1", { status: "no_observations", reportedState: "unknown", effectiveState: "unknown", freshness: "unknown" }), "no_observations"],
    ["unresolved selection", status("SVT1", { status: "unresolved", reportedState: "unknown", effectiveState: "unknown" }), "unresolved"],
    ["store unavailable", status("SVT1", { status: "unavailable", reportedState: "unknown", effectiveState: "unknown" }), "unavailable"],
    ["stale offline", status("SVT1", { reportedState: "offline", effectiveState: "unknown", sourceUpdatedAt: iso("2026-11-12T10:00:00Z") }), "stale"],
  ])("%s is never active or confidently clear", (_name, row, reason) => {
    expect(classify({ status: row, events: events([]) })).toMatchObject({ status: "unknown", statusReason: reason });
  });

  test("fresh offline report is offline; failed or unread status stays distinguishable", () => {
    expect(classify({ status: status("SVT1", { reportedState: "offline", effectiveState: "unknown" }) })).toMatchObject({ status: "offline", statusReason: "offline" });
    expect(classify({ status: null })).toMatchObject({ status: "unknown", statusReason: "status_unavailable" });
    expect(classify({ status: undefined })).toMatchObject({ status: "unknown", statusReason: "status_not_read" });
  });

  test("recent requires a fresh stop plus a provider-reported completed end within 48h", () => {
    expect(classify({ status: status("SVT1"), events: events([event()]) })).toMatchObject({ status: "recent",
      latestEventStart: "2026-11-12T06:00:00.000Z", latestEventEnd: "2026-11-12T08:00:00.000Z", eventDurationMinutes: 120, statusReason: "recently_stopped" });
    expect(classify({ status: status("SVT1"), events: events([event({ startedAt: iso("2026-11-10T08:00:00Z"), endedAt: iso("2026-11-10T11:59:00Z") })]) }))
      .toMatchObject({ status: "unknown", statusReason: "not_spilling_no_recent_event" });
  });

  test("uses the latest event: an earlier completion does not hide a later held or unresolved event", () => {
    const earlier = event();
    expect(classify({ status: status("SVT1"), events: events([earlier, event({ eventId: "cse_" + "b".repeat(24), startedAt: iso("2026-11-12T09:00:00Z"), reconciliation: "held" })]) }))
      .toMatchObject({ status: "unknown", statusReason: "event_held" });
    expect(classify({ status: status("SVT1"), events: events([earlier, event({ eventId: "cse_" + "c".repeat(24), startedAt: iso("2026-11-12T09:00:00Z"),
      lifecycle: "unresolved", endedAt: null, boundaryProvenance: "end_not_reported", endNoLaterThan: iso("2026-11-12T10:00:00Z") })]) }))
      .toMatchObject({ status: "unknown", latestEventEnd: null, statusReason: "event_unresolved" });
    expect(classify({ status: status("SVT1"), events: events([event({ endedAt: null, boundaryProvenance: "end_not_reported", endNoLaterThan: iso("2026-11-12T09:00:00Z") })]) }))
      .toMatchObject({ status: "unknown", latestEventEnd: null, statusReason: "event_end_not_reported" });
  });

  test("empty, failed and truncated event reads never become 'not spilling'", () => {
    expect(classify({ status: status("SVT1"), events: events([]) })).toMatchObject({ status: "unknown", statusReason: "not_spilling_no_recent_event" });
    expect(classify({ status: status("SVT1"), events: null })).toMatchObject({ status: "unknown", statusReason: "events_unavailable" });
    expect(classify({ status: status("SVT1"), events: events([], { truncated: true }) })).toMatchObject({ status: "unknown", statusReason: "events_truncated" });
  });
});

describe("identity mapping", () => {
  test("maps exact Severn Trent externalIds and reports missing or ambiguous identities without guessing", () => {
    const identities = resolveCsoIdentities(["SVT1", "SVT2", "SVT3"], [
      asset("SVT1"), asset("SVT1", { provider: "wessex-water", assetId: "wessex-water:storm-overflow-activity:SVT1" }),
      asset("SVT2"), asset("SVT2", { sourceId: "other-source", assetId: "severn-trent:other-source:SVT2" }),
    ]);
    expect(identities.get("SVT1")).toMatchObject({ state: "mapped", assetId: ST("SVT1") });
    expect(identities.get("SVT2")).toMatchObject({ state: "ambiguous", assetId: null, candidates: [ST("SVT2"), "severn-trent:other-source:SVT2"] });
    expect(identities.get("SVT3")).toMatchObject({ state: "missing", assetId: null });
    expect(classifyRdpLocation("SVT2", { identity: identities.get("SVT2"), status: undefined }, { now: NOW })).toMatchObject({ status: "unknown", statusReason: "identity_ambiguous" });
  });
});

describe("bounded reads", () => {
  test("pages the catalogue, batches status by 20, and reads events only where they can change the answer", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `SVT${i}`);
    rdp = fakeClient({ statusRows: { [ST("SVT0")]: spilling("SVT0"), [ST("SVT1")]: spilling("SVT1", { freshness: "stale" }) } });
    rdp.listCsoOutfalls
      .mockResolvedValueOnce({ assets: ids.slice(0, 15).map((id) => asset(id)), total: 25, catalogues: [], nextCursor: "c".repeat(48) })
      .mockResolvedValueOnce({ assets: ids.slice(15).map((id) => asset(id)), total: 25, catalogues: [], nextCursor: null });
    const read = await readRdpCsoEvidence(ids, NOW);
    expect(read.ok).toBe(true);
    expect(rdp.listCsoOutfalls).toHaveBeenCalledTimes(2);
    expect(rdp.listCsoOutfalls.mock.calls[1][0]).toEqual({ limit: 1000, cursor: "c".repeat(48) });
    expect(rdp.getCsoStatus.mock.calls.map(([batch]) => batch.length)).toEqual([20, 5]);
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(CSO_MAX_EVENT_READS);
    expect(rdp.getCsoEvents.mock.calls.map(([id]) => id)).not.toContain(ST("SVT1"));
    expect(rdp.getCsoEvents.mock.calls[0][1]).toMatchObject({ ...eventWindow(NOW), limit: 100 });
    expect(read.budget).toMatchObject({ members: 25, statusBatches: 2, eventReads: 20 });
  });

  test("follows event cursors up to the page cap and marks the result truncated", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")] });
    rdp.getCsoEvents.mockImplementation(async () => ({ events: [], coverage: { status: "partial", gaps: [] }, nextCursor: "d".repeat(48) }));
    const read = await readRdpCsoEvidence(["SVT1"], NOW);
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(3);
    expect(read.evidence.get("SVT1").events.truncated).toBe(true);
  });

  test("a partial batch failure isolates the failed batch; all batches failing is not ok", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `SVT${i}`);
    rdp = fakeClient({ assets: ids.map((id) => asset(id)) });
    rdp.getCsoStatus.mockImplementationOnce(async () => { throw new RdpError("THROTTLED", 429); });
    const read = await readRdpCsoEvidence(ids, NOW);
    expect(read.ok).toBe(true);
    expect(read.failures).toContainEqual(expect.objectContaining({ stage: "status", code: "THROTTLED" }));
    expect(read.evidence.get("SVT0").status).toBeNull();
    expect(read.evidence.get("SVT20").status).toMatchObject({ status: "available" });

    __resetRdpCsoStateForTests();
    rdp.getCsoStatus.mockRejectedValue(new RdpError("AUTHORIZATION_FAILED", 403));
    await expect(readRdpCsoEvidence(["SVT1"], NOW)).resolves.toMatchObject({ ok: false, error: "AUTHORIZATION_FAILED" });
  });

  test("catalogue failures and inconsistent totals fail closed; a stale cursor restarts once", async () => {
    rdp.listCsoOutfalls.mockRejectedValue(new RdpError("STORAGE_UNAVAILABLE", 503));
    await expect(readRdpCsoEvidence(["SVT1"], NOW)).resolves.toMatchObject({ ok: false, error: "STORAGE_UNAVAILABLE" });
    expect(rdp.getCsoStatus).not.toHaveBeenCalled();

    __resetRdpCsoStateForTests();
    rdp = fakeClient();
    rdp.listCsoOutfalls.mockResolvedValue({ assets: [asset("SVT1")], total: 2, catalogues: [], nextCursor: null });
    await expect(readRdpCsoEvidence(["SVT1"], NOW)).resolves.toMatchObject({ ok: false, error: "RESPONSE_CONTRACT_ERROR" });

    __resetRdpCsoStateForTests();
    rdp = fakeClient();
    rdp.listCsoOutfalls
      .mockResolvedValueOnce({ assets: [], total: 2, catalogues: [], nextCursor: "c".repeat(48) })
      .mockRejectedValueOnce(new RdpError("CURSOR_STALE", 409))
      .mockResolvedValueOnce({ assets: [asset("SVT1")], total: 1, catalogues: [], nextCursor: null });
    await expect(readRdpCsoEvidence(["SVT1"], NOW)).resolves.toMatchObject({ ok: true });
    expect(rdp.listCsoOutfalls).toHaveBeenCalledTimes(3);
  });

  test("concurrent requests coalesce into one read per resource", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")] });
    await Promise.all([readRdpCsoEvidence(["SVT1"], NOW), readRdpCsoEvidence(["SVT1"], NOW), readRdpCsoEvidence(["SVT1"], NOW)]);
    expect(rdp.listCsoOutfalls).toHaveBeenCalledTimes(1);
    expect(rdp.getCsoStatus).toHaveBeenCalledTimes(1);
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(1);
  });

  test("unmapped members are never sent to the status route (unknown ids 404 the whole batch)", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")] });
    await readRdpCsoEvidence(["SVT1", "GONE"], NOW);
    expect(rdp.getCsoStatus).toHaveBeenCalledWith([ST("SVT1")]);
  });
});

describe("rdp mode snapshot", () => {
  test("keeps the legacy membership and public shape, sourcing status from RDP", async () => {
    const latest = summary(["SVT1", "SVT2", "SVT3", "GONE"]);
    mockMongo(latest);
    rdp = fakeClient({ assets: ["SVT1", "SVT2", "SVT3"].map((id) => asset(id)), statusRows: {
      [ST("SVT1")]: spilling("SVT1"), [ST("SVT3")]: status("SVT3", { reportedState: "offline", effectiveState: "unknown" }) },
    eventsById: { [ST("SVT2")]: [event()] } });
    const snapshot = await getRdpWaterQualitySnapshot(NOW);
    expect(snapshot.statusSummary).toEqual({ currentlySpilling: 1, recentlyStopped48h: 1, offline: 1, unknown: 1 });
    expect(snapshot.ActiveCSOIds).toEqual(["SVT1"]);
    expect(snapshot.WaterQuality).toEqual({ NumberUpstreamCSOs: 4, NumberCSOsPerKm2: 0.04, CSOIds: ["SVT1", "SVT2", "SVT3", "GONE"], CSOActiveTime: 4 });
    expect(snapshot.locations.map((l) => [l.id, l.status, l.statusReason])).toEqual([
      ["SVT1", "active", "spilling"], ["SVT2", "recent", "recently_stopped"], ["SVT3", "offline", "offline"], ["GONE", "unknown", "identity_missing"]]);
    expect(snapshot.health).toMatchObject({ source: "river-data-platform-cso", state: "fresh", cso: { origin: "rdp", partial: false, unknown: 1 } });

    // Same top-level and per-location keys as legacy (statusReason is the only additive field).
    mockMongo(latest, [legacyRecord("SVT1", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z") })]);
    const legacy = await getLatestWaterQualitySnapshot(NOW);
    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(legacy).sort());
    expect(Object.keys(snapshot.locations[0]).filter((key) => key !== "statusReason").sort()).toEqual(Object.keys(legacy.locations[0]).sort());
  });

  test("a stale membership summary marks health stale but never invents status", async () => {
    mockMongo(summary(["SVT1"], "2026-11-12T10:00:00Z"));
    rdp = fakeClient({ assets: [asset("SVT1")], statusRows: { [ST("SVT1")]: spilling("SVT1") } });
    const snapshot = await getRdpWaterQualitySnapshot(NOW);
    expect(snapshot.health.state).toBe("stale");
    expect(snapshot.ActiveCSOIds).toEqual(["SVT1"]);
  });

  test("total RDP failure serves the whole legacy snapshot as fallback, never a mix", async () => {
    mockMongo(summary(["SVT1"]), [legacyRecord("SVT1", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z") })]);
    rdp.listCsoOutfalls.mockRejectedValue(new RdpError("AUTHORIZATION_FAILED", 403));
    const snapshot = await getRdpWaterQualitySnapshot(NOW);
    expect(snapshot.ActiveCSOIds).toEqual(["SVT1"]);
    expect(snapshot.locations[0]).not.toHaveProperty("statusReason");
    expect(snapshot.health).toMatchObject({ source: "mongodb-water-quality", state: "fallback", cso: { origin: "legacy", rdpError: "AUTHORIZATION_FAILED" } });
  });

  test("detail compatibility uses the legacy record shape; unverified status is null, never 0", async () => {
    rdp = fakeClient({ assets: [asset("SVT1"), asset("SVT2"), asset("SVT3")], statusRows: {
      [ST("SVT1")]: spilling("SVT1"), [ST("SVT2")]: status("SVT2", { freshness: "stale" }) } });
    const details = await getRdpCsoDetailsByIds(["SVT1", "SVT2", "SVT3", "GONE"], NOW);
    expect(Object.keys(details)).toEqual(["SVT1", "SVT2", "SVT3"]);
    expect(details.SVT1).toEqual({ Id: "SVT1", Status: 1, StatusStart: "2026-11-12T08:00:00.000Z", LatestEventStart: "2026-11-12T08:00:00.000Z",
      LatestEventEnd: null, LastUpdated: "2026-11-12T11:50:00.000Z", ReceivingWaterCourse: "River Trent", DateScraped: "2026-11-12T11:52:00.000Z",
      Coordinates: { x: -1.2, y: 52.9 } });
    expect(details.SVT2.Status).toBeNull();
    expect(details.SVT3.Status).toBe(0);
    await expect(getRdpCsoDetailsByIds(Array.from({ length: 21 }, (_, i) => `S${i}`), NOW)).rejects.toMatchObject({ statusCode: 400 });
    __resetRdpCsoStateForTests();
    rdp.getCsoStatus.mockRejectedValue(new RdpError("UPSTREAM_ERROR", 503));
    await expect(getRdpCsoDetailsByIds(["SVT1"], NOW)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("shadow comparison", () => {
  test("returns the legacy result unchanged and logs time-aligned differences", async () => {
    mockMongo(summary(["SVT1", "SVT2", "SVT3", "SVT4"]), [
      legacyRecord("SVT1", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z") }),
      legacyRecord("SVT2", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z") }),
      legacyRecord("SVT3", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z"), LastUpdated: new Date("2026-11-12T11:00:00Z") }),
    ]);
    rdp = fakeClient({ assets: ["SVT1", "SVT2", "SVT3"].map((id) => asset(id)), statusRows: {
      [ST("SVT1")]: spilling("SVT1"), [ST("SVT3")]: spilling("SVT3") } });
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const legacy = await getLatestWaterQualitySnapshot(NOW);
    const shadow = await getShadowWaterQualitySnapshot(NOW);
    expect(shadow).toEqual(legacy);
    const line = log.mock.calls.map(([message]) => message).find((message) => message.includes("RDP CSO shadow comparison"));
    const report = JSON.parse(line.slice(line.indexOf("{")));
    expect(report.summary.outcomes).toEqual({ match: 1, status_mismatch: 1, not_comparable: 1, identity_missing: 1 });
    expect(report.differences.map((row) => [row.id, row.outcome])).toEqual([["SVT2", "status_mismatch"], ["SVT3", "not_comparable"], ["SVT4", "identity_missing"]]);
    expect(report.differences.find((row) => row.id === "SVT3").sourceLagSeconds).toBe(3000);
    log.mockRestore();
  });

  test("an RDP failure or hang never rejects or delays legacy output beyond the deadline", async () => {
    mockMongo(summary(["SVT1"]), [legacyRecord("SVT1", { Status: 0 })]);
    rdp.listCsoOutfalls.mockImplementation(() => new Promise(() => {}));
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const pending = getShadowWaterQualitySnapshot(NOW);
    await jest.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toMatchObject({ Id: "wq-1" });
    const line = log.mock.calls.map(([message]) => message).find((message) => message.includes("RDP CSO shadow comparison"));
    expect(JSON.parse(line.slice(line.indexOf("{"))).rdp).toMatchObject({ ok: false, error: "TIMEOUT" });
    log.mockRestore();
  });

  test("event boundaries are compared only for compatible reports", () => {
    const legacy = { id: "SVT1", status: "recent", latestEventStart: "2026-11-12T06:00:00.000Z", latestEventEnd: "2026-11-12T08:00:00.000Z",
      sourceUpdatedAt: "2026-11-12T11:50:00.000Z", observedAt: "2026-11-12T11:55:00.000Z" };
    const member = { identity: mapped("SVT1"), status: status("SVT1") };
    const rdpLocation = classify({ status: status("SVT1"), events: events([event({ endedAt: iso("2026-11-12T08:30:00Z") })]) });
    expect(compareCsoLocation(legacy, rdpLocation, member)).toMatchObject({ outcome: "event_mismatch",
      eventDiffs: [{ field: "latestEventEnd", legacy: "2026-11-12T08:00:00.000Z", rdp: "2026-11-12T08:30:00.000Z" }] });
  });

  test("the diagnostic report adds health, selection and failures without writing", async () => {
    const csoData = mockMongo(summary(["SVT1", "SVT2"]), [legacyRecord("SVT1", { Status: 0 })]);
    rdp = fakeClient({ assets: [asset("SVT1"), asset("SVT2", { selected: false, sets: [] })] });
    rdp.getCsoHealth.mockImplementation(async (id) => { if (id === ST("SVT2")) throw new RdpError("THROTTLED", 429); return { selection: { state: "selected" }, catalogue: { state: "Healthy" }, coverageLast24h: { status: "partial", gaps: [{}] } }; });
    const report = await getCsoShadowReport(NOW);
    expect(report.summary.notSelectedForPolling).toEqual(["SVT2"]);
    expect(report.rdp.failures).toContainEqual({ stage: "health", code: "THROTTLED", ids: ["SVT2"] });
    expect(report.locations[0].health).toEqual({ selection: "selected", catalogue: "Healthy", coverageLast24h: "partial", gaps24h: 1 });
    expect(report.locations[1]).toMatchObject({ legacyStatus: "unknown", rdpStatus: "unknown", health: null });
    expect(Object.keys(csoData).filter((key) => key !== "aggregate")).toEqual([]);
  });
});

describe("source-mode switching", () => {
  test("defaults to legacy, rejects invalid values, and never builds the RDP client in legacy", async () => {
    expect(getCsoSourceMode({})).toBe("legacy");
    expect(getCsoSourceMode({ RDP_CSO_SOURCE: "shadow" })).toBe("shadow");
    expect(getCsoSourceMode({ RDP_CSO_SOURCE: "RDP" })).toBeNull();
    mockMongo(summary(["SVT1"]), [legacyRecord("SVT1", { Status: 1, LatestEventStart: new Date("2026-11-12T08:00:00Z") })]);
    await getPublicWaterQualitySnapshot();
    await getPublicCsoDetailsByIds(["SVT1"]);
    process.env.RDP_CSO_SOURCE = "nonsense";
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(getPublicWaterQualitySnapshot()).resolves.toMatchObject({ health: { source: "mongodb-water-quality" } });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Invalid RDP_CSO_SOURCE"));
    error.mockRestore();
    expect(createRdpClient).not.toHaveBeenCalled();
  });

  test("shadow serves legacy; rdp serves RDP; detail routes switch only in rdp", async () => {
    mockMongo(summary(["SVT1"]), [legacyRecord("SVT1", { Status: 0 })]);
    rdp = fakeClient({ assets: [asset("SVT1")], statusRows: { [ST("SVT1")]: spilling("SVT1") } });
    jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.RDP_CSO_SOURCE = "shadow";
    expect((await getPublicWaterQualitySnapshot()).health.source).toBe("mongodb-water-quality");
    expect(await getPublicCsoDetailsByIds(["SVT1"])).toMatchObject({ SVT1: { Status: 0 } });
    process.env.RDP_CSO_SOURCE = "rdp";
    expect(await getPublicWaterQualitySnapshot()).toMatchObject({ ActiveCSOIds: ["SVT1"], health: { source: "river-data-platform-cso" } });
    expect(await getPublicCsoDetailsByIds(["SVT1"])).toMatchObject({ SVT1: { Status: 1 } });
    console.log.mockRestore();
  });

  test("alert evaluation's legacy snapshot ignores RDP_CSO_SOURCE", async () => {
    process.env.RDP_CSO_SOURCE = "rdp";
    mockMongo(summary(["SVT1"]), [legacyRecord("SVT1", { Status: 0 })]);
    const snapshot = await getLatestWaterQualitySnapshot(NOW);
    expect(snapshot.health.source).toBe("mongodb-water-quality");
    expect(createRdpClient).not.toHaveBeenCalled();
  });
});
