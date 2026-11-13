/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { connectToDatabase } from "../libs/database";
import { parseCsoCatalogue, parseCsoEvent, parseCsoEvents, parseCsoRevisions } from "../libs/rdp/csoContract";
import live from "../testUtils/fixtures/rdpCsoLiveHistory.json";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import {
  assessHistory, summariseCoverage, describeEvent, getCsoEventDetail, getCsoEventHistory, historyWindow,
  CSO_HISTORY_MAX_PAGES,
} from "../libs/rdp/csoHistory";
import { getPublicCsoEventHistory, getPublicCsoEventDetail, isCsoHistoryEnabled } from "../libs/services/waterQualityService";
import { ST, NOW, asset as rawAsset } from "../testUtils/rdpCsoFixtures";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));

const iso = (value) => new Date(value).toISOString();
const EVENT_A = "cse_" + "a".repeat(24);
const EVENT_B = "cse_" + "b".repeat(24);
const EVENT_C = "cse_" + "c".repeat(24);
const asset = (id, overrides) => ({ ...rawAsset(id), ...overrides });
const event = (overrides = {}) => ({ eventId: EVENT_A, startedAt: iso("2026-11-12T06:00:00Z"), endedAt: iso("2026-11-12T08:00:00Z"),
  endNoLaterThan: null, lifecycle: "completed", boundaryProvenance: "provider_reported", revision: 1, reconciliation: "resolved",
  heldClaims: 0, tier: "hot", ...overrides });
const cover = (overrides = {}) => ({ status: "partial", collectedFrom: iso("2026-11-11T12:00:00Z"), collectedTo: iso("2026-11-12T11:52:00Z"),
  reportingCompleteness: "unverified", gaps: [], ...overrides });
const page = (events, overrides = {}) => ({ events, coverage: cover(), requestAsOf: iso("2026-11-12T11:59:00Z"), nextCursor: null, ...overrides });

function mockMembership(ids) {
  const latest = { id: "wq-1", scrape_timestamp: new Date("2026-11-12T11:50:00Z"), water_quality: { CSO_IDs: ids } };
  const waterQuality = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(latest) }) }) }) };
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => waterQuality) } });
}

let rdp;
function fakeClient({ assets = [], pages = {}, details = {}, revisions = {} } = {}) {
  return {
    listCsoOutfalls: jest.fn(async () => ({ assets, total: assets.length, catalogues: [], nextCursor: null })),
    getCsoEvents: jest.fn(async (id, { cursor }) => {
      const value = pages[id];
      if (value instanceof Error) throw value;
      const list = Array.isArray(value) ? value : [value ?? page([])];
      return list[cursor ? Number(cursor) : 0];
    }),
    getCsoEvent: jest.fn(async (id) => { if (details[id] instanceof Error) throw details[id]; return details[id]; }),
    getCsoEventRevisions: jest.fn(async (id) => { if (revisions[id] instanceof Error) throw revisions[id]; return revisions[id]; }),
  };
}

const originalEnv = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  __resetRdpCsoStateForTests();
  rdp = fakeClient();
  createRdpClient.mockImplementation(() => rdp);
  process.env = { ...originalEnv };
  delete process.env.RDP_CSO_HISTORY;
});
afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

describe("event and revision contracts", () => {
  const interval = (overrides = {}) => ({ startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z", endNoLaterThan: null, status: "completed", ...overrides });
  const detailPayload = (overrides = {}) => ({
    data: { event: { ...event(), assetId: ST("SVT1"), startedAt: "2026-11-12T06:00:00Z", endedAt: "2026-11-12T08:00:00Z", revision: 2 },
      updatedAt: "2026-11-12T09:00:00Z",
      currentRevision: { revision: 2, changeReason: "end_corrected", recordedAt: "2026-11-12T09:00:00Z", claimId: "claim-1",
        sourceFetchedAt: "2026-11-12T08:59:00Z", reconciliation: "automatic" },
      openHolds: [], archive: { archived: false, generation: null }, ...overrides },
    meta: { retrievedAt: "2026-11-12T11:59:00Z" },
  });

  test("parses one event with its provenance", () => {
    const parsed = parseCsoEvent(detailPayload(), EVENT_A);
    expect(parsed).toMatchObject({ event: { eventId: EVENT_A, assetId: ST("SVT1"), revision: 2 },
      currentRevision: { changeReason: "end_corrected", reconciliation: "automatic" }, archive: { archived: false, generation: null } });
    expect(parsed.currentRevision).not.toHaveProperty("claimId");
  });

  test.each([
    ["another event", (p) => { p.data.event.eventId = EVENT_B; }],
    ["an unknown change reason", (p) => { p.data.currentRevision.changeReason = "guessed"; }],
    ["an ongoing event with an end", (p) => { p.data.event.lifecycle = "ongoing"; }],
    ["a malformed hold", (p) => { p.data.openHolds = [{ claimId: "x" }]; }],
  ])("rejects %s", (_name, mutate) => {
    const payload = detailPayload();
    mutate(payload);
    expect(() => parseCsoEvent(payload, EVENT_A)).toThrow("RESPONSE_CONTRACT_ERROR");
  });

  test("parses revisions oldest first and refuses out-of-order history", () => {
    const payload = { data: [
      { revision: 1, recordedAt: "2026-11-12T06:15:00Z", changeReason: "created", claimId: "c1", sourceFetchedAt: "2026-11-12T06:14:00Z",
        reconciliation: "automatic", current: interval({ endedAt: null, status: "ongoing" }), previous: null },
      { revision: 2, recordedAt: "2026-11-12T08:15:00Z", changeReason: "completed", claimId: "c2", sourceFetchedAt: "2026-11-12T08:14:00Z",
        reconciliation: "automatic", current: interval(), previous: interval({ endedAt: null, status: "ongoing" }) },
    ], meta: { eventId: EVENT_A, assetId: ST("SVT1"), currentRevision: 2, openHolds: [], nextCursor: null } };
    const parsed = parseCsoRevisions(payload, EVENT_A);
    expect(parsed.revisions.map((row) => row.revision)).toEqual([1, 2]);
    expect(parsed.revisions[1].previous).toMatchObject({ status: "ongoing", endedAt: null });
    payload.data.reverse();
    expect(() => parseCsoRevisions(payload, EVENT_A)).toThrow("RESPONSE_CONTRACT_ERROR");
  });
});

describe("windows, coverage and event descriptions", () => {
  test("aligns windows to buckets and rejects other windows", () => {
    expect(historyWindow("24h", new Date("2026-11-12T11:52:10Z"))).toMatchObject({ from: "2026-11-11T12:00:00Z", to: "2026-11-12T12:00:00Z", hours: 24 });
    expect(historyWindow("30d", new Date("2026-11-12T11:52:10Z"))).toMatchObject({ from: "2026-10-13T12:00:00Z", to: "2026-11-12T12:00:00Z" });
    expect(() => historyWindow("1y", NOW)).toThrow("window must be one of 24h, 7d, 30d");
  });

  test("measures collected share up to RDP's answer, treating the not-yet-due poll as pending", () => {
    const from = "2026-11-11T12:00:00Z";
    const to = "2026-11-12T12:00:00Z";
    const asOf = "2026-11-12T12:00:00Z";
    const gap = (a, b) => ({ from: iso(a), to: iso(b), reason: "not_collected" });
    expect(summariseCoverage(cover(), from, to, asOf).collectedFraction).toBe(1);
    expect(summariseCoverage(cover({ gaps: [gap("2026-11-10T00:00:00Z", "2026-11-11T18:00:00Z")] }), from, to, asOf).collectedFraction).toBe(0.75);
    expect(summariseCoverage(cover({ status: "unknown" }), from, to, asOf).collectedFraction).toBe(0);
    const trailing = summariseCoverage(cover({ gaps: [gap("2026-11-12T11:52:00Z", "2026-11-12T12:15:00Z")] }), from, "2026-11-12T12:15:00Z", "2026-11-12T11:59:00Z");
    expect(trailing).toMatchObject({ gaps: [], awaitingNextCheck: true, collectedFraction: 1 });
    // An outage that started before the tolerance is still a gap.
    expect(summariseCoverage(cover({ gaps: [gap("2026-11-12T10:00:00Z", "2026-11-12T12:00:00Z")] }), from, to, asOf).gaps).toHaveLength(1);
  });

  test("an ongoing spill never gets an end; an unreported end stays uncertain", () => {
    const context = { from: iso("2026-11-11T12:00:00Z"), asOf: iso("2026-11-12T11:59:00Z") };
    expect(describeEvent(event({ lifecycle: "ongoing", endedAt: null, startedAt: iso("2026-11-12T10:00:00Z") }), context))
      .toMatchObject({ display: "ongoing", endedAt: null, durationMinutes: null, elapsedMinutes: 119 });
    expect(describeEvent(event({ lifecycle: "unresolved", endedAt: null, boundaryProvenance: "end_not_reported", endNoLaterThan: iso("2026-11-12T07:00:00Z") }), context))
      .toMatchObject({ display: "unresolved", endedAt: null, durationMinutes: null, maxDurationMinutes: 60 });
    expect(describeEvent(event({ lifecycle: "completed", endedAt: null, boundaryProvenance: "end_not_reported" }), context))
      .toMatchObject({ display: "end_not_reported", endedAt: null });
    expect(describeEvent(event({ startedAt: iso("2026-11-10T06:00:00Z"), revision: 3, reconciliation: "held", heldClaims: 1 }), context))
      .toMatchObject({ display: "completed", durationMinutes: 3000, startedBeforeWindow: true, revision: 3, underReview: true });
  });
});

describe("getCsoEventHistory", () => {
  const ids = ["SVT1", "SVT2", "SVT3", "SVT4"];
  beforeEach(() => mockMembership(ids));

  test("lists active, completed, corrected and unresolved events newest first with per-outfall coverage", async () => {
    rdp = fakeClient({
      assets: [asset("SVT1"), asset("SVT2"), asset("SVT3", { selected: false })],
      pages: {
        [ST("SVT1")]: page([event({ eventId: EVENT_A }), event({ eventId: EVENT_B, startedAt: iso("2026-11-12T10:00:00Z"), endedAt: null, lifecycle: "ongoing" })]),
        [ST("SVT2")]: page([event({ eventId: EVENT_C, startedAt: iso("2026-11-12T09:00:00Z"), endedAt: null, lifecycle: "unresolved",
          boundaryProvenance: "end_not_reported", revision: 2 })], { coverage: cover({ gaps: [{ from: iso("2026-11-12T00:00:00Z"), to: iso("2026-11-12T06:00:00Z"), reason: "not_collected" }] }) }),
      },
    });
    const history = await getCsoEventHistory("24h", NOW);
    expect(history.state).toBe("available");
    expect(history.events.map((e) => [e.eventId, e.display, e.outfallId])).toEqual([
      [EVENT_B, "ongoing", "SVT1"], [EVENT_C, "unresolved", "SVT2"], [EVENT_A, "completed", "SVT1"]]);
    expect(history.events[1]).toMatchObject({ revision: 2, endedAt: null });
    expect(history.events[1]).not.toHaveProperty("corrected");
    expect(history.outfalls.map((o) => o.state)).toEqual(["read", "read", "not_monitored", "identity_missing"]);
    expect(history.outfalls[1].coverage).toMatchObject({ collectedFraction: 0.75, gaps: [expect.any(Object)] });
    expect(history.evidence).toMatchObject({ conclusion: "events", outfalls: { members: 4, read: 2, notMonitored: 1, unmapped: 1 },
      coverage: { gapCount: 1, collectedFraction: 0.875, reportingCompleteness: "unverified" } });
    // Unselected and unmapped outfalls are never read.
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(2);
    expect(rdp.getCsoEvents).toHaveBeenCalledWith(ST("SVT1"), { from: "2026-11-11T12:00:00Z", to: "2026-11-12T12:00:00Z", limit: 200, cursor: undefined });
  });

  test("an empty, fully collected window is 'no reported events', never proof of no spills", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")] });
    mockMembership(["SVT1"]);
    const history = await getCsoEventHistory("7d", NOW);
    expect(history.evidence).toMatchObject({ conclusion: "no_reported_events", complete: true, coverage: { reportingCompleteness: "unverified" } });
  });

  test("an empty window with gaps or a failed outfall is incomplete coverage", async () => {
    rdp = fakeClient({ assets: [asset("SVT1"), asset("SVT2")], pages: {
      [ST("SVT1")]: page([], { coverage: cover({ status: "unknown", collectedFrom: null, collectedTo: null }) }),
      [ST("SVT2")]: new RdpError("ARCHIVE_INTEGRITY", 503),
    } });
    const history = await getCsoEventHistory("24h", NOW);
    expect(history.outfalls.map((o) => [o.state, o.errorCode])).toEqual([["read", undefined], ["failed", "ARCHIVE_INTEGRITY"], ["identity_missing", undefined], ["identity_missing", undefined]]);
    expect(history.evidence).toMatchObject({ conclusion: "coverage_incomplete", outfalls: { failed: 1 }, complete: false });
  });

  test("follows cursors up to the page budget and then reports truncation", async () => {
    mockMembership(["SVT1"]);
    const pages = Array.from({ length: CSO_HISTORY_MAX_PAGES }, (_, i) => page([event({ eventId: `cse_${String(i).repeat(24)}`, startedAt: iso(`2026-11-12T0${i}:00:00Z`) })],
      { nextCursor: String(i + 1) }));
    rdp = fakeClient({ assets: [asset("SVT1")], pages: { [ST("SVT1")]: pages } });
    const history = await getCsoEventHistory("24h", NOW);
    expect(rdp.getCsoEvents).toHaveBeenCalledTimes(CSO_HISTORY_MAX_PAGES);
    expect(history.events).toHaveLength(CSO_HISTORY_MAX_PAGES);
    expect(history.outfalls[0].truncated).toBe(true);
    expect(history.evidence).toMatchObject({ truncated: true, complete: false });
  });

  test("a catalogue failure is an unavailable history, not an error or an empty list", async () => {
    rdp.listCsoOutfalls.mockRejectedValue(new RdpError("AUTHORIZATION_FAILED", 403));
    const history = await getCsoEventHistory("24h", NOW);
    expect(history).toMatchObject({ state: "unavailable", errorCode: "AUTHORIZATION_FAILED", events: [], evidence: { conclusion: "not_monitored" } });
  });

  test("all monitored outfalls failing is unavailable", async () => {
    mockMembership(["SVT1"]);
    rdp = fakeClient({ assets: [asset("SVT1")], pages: { [ST("SVT1")]: new RdpError("STORAGE_UNAVAILABLE", 503) } });
    expect(await getCsoEventHistory("24h", NOW)).toMatchObject({ state: "unavailable", evidence: { conclusion: "unavailable" } });
  });

  test("30 days is only called sufficient when most of it was collected", () => {
    const window = historyWindow("30d", NOW);
    const read = (fraction) => ({ state: "read", truncated: false, coverage: { gaps: fraction < 1 ? [{}] : [], collectedFraction: fraction } });
    expect(assessHistory({ outfalls: [read(0.5)], events: [], window }).coverage.sufficient).toBe(false);
    expect(assessHistory({ outfalls: [read(0.9)], events: [], window }).coverage.sufficient).toBe(true);
  });
});

describe("getCsoEventDetail", () => {
  const detail = (assetId = ST("SVT1")) => ({ event: { ...event({ revision: 2 }), assetId }, updatedAt: iso("2026-11-12T09:00:00Z"),
    currentRevision: { revision: 2, changeReason: "end_corrected", recordedAt: iso("2026-11-12T09:00:00Z"), sourceFetchedAt: iso("2026-11-12T08:59:00Z"), reconciliation: "automatic" },
    openHolds: [{ claimId: "secret-claim", fetchedAt: iso("2026-11-12T09:30:00Z"), reason: "PrecedesLatestEvent" }],
    archive: { archived: false, generation: null }, retrievedAt: iso("2026-11-12T11:59:00Z") });
  const interval = (end) => ({ startedAt: iso("2026-11-12T06:00:00Z"), endedAt: end, endNoLaterThan: null, status: end ? "completed" : "ongoing" });
  const revisions = (assetId = ST("SVT1")) => ({ assetId, openHolds: [], nextCursor: null, currentRevision: 2, revisions: [
    { revision: 1, recordedAt: iso("2026-11-12T06:15:00Z"), changeReason: "completed", sourceFetchedAt: iso("2026-11-12T06:14:00Z"), reconciliation: "automatic", current: interval(iso("2026-11-12T07:00:00Z")), previous: null },
    { revision: 2, recordedAt: iso("2026-11-12T09:00:00Z"), changeReason: "end_corrected", sourceFetchedAt: iso("2026-11-12T08:59:00Z"), reconciliation: "automatic", current: interval(iso("2026-11-12T08:00:00Z")), previous: interval(iso("2026-11-12T07:00:00Z")) },
  ] });

  beforeEach(() => mockMembership(["SVT1"]));

  test("keeps every material revision and the earlier evidence visible", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")], details: { [EVENT_A]: detail() }, revisions: { [EVENT_A]: revisions() } });
    const result = await getCsoEventDetail(EVENT_A);
    expect(result.event).toMatchObject({ corrected: true, endedAt: "2026-11-12T08:00:00.000Z", outfallId: "SVT1" });
    expect(result.revisions[0]).toMatchObject({ changeLabel: "End reported by provider", correction: false });
    expect(result.revisions[1]).toMatchObject({ changeLabel: "End time corrected", correction: true, changed: ["endedAt"], previous: { endedAt: "2026-11-12T07:00:00.000Z" } });
    expect(result.attribution).toMatchObject({ providerLabel: "Severn Trent Water", method: "live_reconstruction" });
    expect(JSON.stringify(result)).not.toContain("secret-claim");
  });

  test("refuses events outside the HPP membership and malformed ids", async () => {
    rdp = fakeClient({ assets: [asset("SVT1"), asset("OTHER")], details: { [EVENT_A]: detail(ST("OTHER")) }, revisions: { [EVENT_A]: revisions(ST("OTHER")) } });
    await expect(getCsoEventDetail(EVENT_A)).rejects.toMatchObject({ statusCode: 404 });
    await expect(getCsoEventDetail("../../v1/measurements")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("maps not-found and RDP failures", async () => {
    rdp = fakeClient({ assets: [asset("SVT1")], details: { [EVENT_A]: new RdpError("EVENT_NOT_FOUND", 404) }, revisions: { [EVENT_A]: revisions() } });
    await expect(getCsoEventDetail(EVENT_A)).rejects.toMatchObject({ statusCode: 404 });
    __resetRdpCsoStateForTests();
    rdp = fakeClient({ assets: [asset("SVT1")], details: { [EVENT_A]: new RdpError("ARCHIVE_INTEGRITY", 503) }, revisions: { [EVENT_A]: revisions() } });
    await expect(getCsoEventDetail(EVENT_A)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("RDP_CSO_HISTORY flag", () => {
  test("is off unless exactly 'on' and never reads RDP while off", async () => {
    expect(isCsoHistoryEnabled({})).toBe(false);
    expect(isCsoHistoryEnabled({ RDP_CSO_HISTORY: "true" })).toBe(false);
    expect(await getPublicCsoEventHistory("24h")).toEqual({ enabled: false });
    await expect(getPublicCsoEventDetail(EVENT_A)).rejects.toMatchObject({ statusCode: 404 });
    expect(createRdpClient).not.toHaveBeenCalled();
  });

  test("serves the history when on", async () => {
    process.env.RDP_CSO_HISTORY = "on";
    mockMembership(["SVT1"]);
    rdp = fakeClient({ assets: [asset("SVT1")] });
    expect(await getPublicCsoEventHistory("24h")).toMatchObject({ enabled: true, state: "available" });
  });
});

// Real production responses (read-only capture, 2026-11-12), run through the real contract parsers.
describe("real RDP history records", () => {
  const asOf = new Date("2026-11-12T23:57:00Z");
  function liveClient() {
    const catalogue = parseCsoCatalogue({ data: live.assets, meta: { retrievedAt: "2026-11-12T23:41:47Z", total: live.assets.length,
      impact: "none_implied", catalogues: live.catalogues, nextCursor: null } });
    return {
      listCsoOutfalls: jest.fn(async () => catalogue),
      getCsoEvents: jest.fn(async (id) => parseCsoEvents(live.events[id], id)),
      getCsoEvent: jest.fn(async (id) => parseCsoEvent(live.details[id], id)),
      getCsoEventRevisions: jest.fn(async (id) => parseCsoRevisions(live.revisions[id], id)),
    };
  }
  beforeEach(() => {
    jest.setSystemTime(asOf);
    mockMembership(["SVT01294", "SVT02180", "SVT00265"]);
    rdp = liveClient();
  });

  test("lists every recorded event with honest coverage for a 30-day window", async () => {
    const history = await getCsoEventHistory("30d", asOf);
    expect(history.state).toBe("available");
    expect(history.events).toHaveLength(18);
    expect(new Set(history.events.map((e) => e.display))).toEqual(new Set(["completed", "unresolved"]));
    // Unresolved provider events keep an upper bound only; nothing gets an invented end.
    for (const e of history.events.filter((e) => e.display === "unresolved")) expect(e).toMatchObject({ endedAt: null, durationMinutes: null });
    expect(history.events.filter((e) => e.display === "completed").every((e) => e.endedAt && e.durationMinutes >= 0)).toBe(true);
    // Collection began on 7 and 12 November, so most of 30 days is uncovered and the trailing poll is pending.
    expect(history.evidence.coverage.sufficient).toBe(false);
    expect(history.evidence.conclusion).toBe("events");
    expect(history.outfalls.every((o) => o.coverage.awaitingNextCheck)).toBe(true);
    expect(history.sources[0].attribution).toMatch(/^Severn Trent Water storm overflow activity/);
    const order = history.events.map((e) => e.startedAt);
    expect([...order].sort().reverse()).toEqual(order);
  });

  test("lifecycle revisions are not presented as corrections", async () => {
    const unresolved = await getCsoEventDetail("cse_7cfd9e97c4c48236ad706511");
    expect(unresolved.event).toMatchObject({ display: "unresolved", endedAt: null, endNoLaterThan: "2026-11-08T01:59:46.000Z", corrected: false });
    expect(unresolved.revisions.map((r) => [r.changeLabel, r.correction])).toEqual([["First recorded", false], ["Provider did not report the end", false]]);
    expect(unresolved.revisions[1].previous.status).toBe("ongoing");
    const completed = await getCsoEventDetail("cse_7ae03be229e2dd56b6541f93");
    expect(completed.event).toMatchObject({ display: "completed", corrected: false });
    expect(completed.revisions.map((r) => r.changeReason)).toEqual(["created", "completed"]);
    expect(JSON.stringify([unresolved, completed])).not.toContain("redacted");
  });
});
