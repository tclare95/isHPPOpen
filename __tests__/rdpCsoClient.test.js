/** @jest-environment node */
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient } from "@aws-sdk/client-sts";
import { createRdpClient } from "../libs/rdp/client";
import { RDP_STAGING_API_URL } from "../libs/rdp/config";
import { RIVER_MAX_BYTES } from "../libs/rdp/river";
import {
  ST, CURSOR, asset, catalogue, status, statusResponse, event, eventsResponse, healthResponse, setActivityItem, setActivityResponse,
} from "../testUtils/rdpCsoFixtures";

jest.mock("server-only", () => ({}));
jest.mock("@vercel/oidc", () => ({ getVercelOidcToken: jest.fn() }));
jest.mock("@aws-sdk/client-sts", () => ({
  STSClient: jest.fn(),
  AssumeRoleWithWebIdentityCommand: jest.fn(function (input) { this.input = input; }),
}));
jest.mock("node:timers/promises", () => ({ setTimeout: jest.fn().mockResolvedValue() }));

const preview = {
  VERCEL_ENV: "preview", RDP_API_URL: RDP_STAGING_API_URL, RDP_AWS_REGION: "eu-west-1",
  RDP_ROLE_ARN: "arn:aws:iam::080812383734:role/river-data-platform-staging-vercel-preview",
};
const send = jest.fn();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const originalFetch = global.fetch;
const window = { from: "2026-11-10T11:45:00Z", to: "2026-11-12T12:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  getVercelOidcToken.mockResolvedValue("sensitive-preview-token");
  send.mockReset().mockResolvedValue({ Credentials: {
    AccessKeyId: "ASIAFIXTURE", SecretAccessKey: "fixture-secret", SessionToken: "fixture-session",
    Expiration: new Date(Date.now() + 900000),
  } });
  STSClient.mockImplementation(() => ({ send }));
  global.fetch = jest.fn();
});
afterEach(() => { global.fetch = originalFetch; });

const requested = (call = 0) => new URL(global.fetch.mock.calls[call][0]);

test("status batch signs one bounded GET with canonical ids and normalises source timestamps", async () => {
  global.fetch.mockResolvedValue(json(statusResponse([status("SVT01157"), status("SVT01294", { status: "no_observations",
    reportedState: "unknown", effectiveState: "unknown", freshness: "unknown", sourceUpdatedAt: null, statusStart: null })])));
  const result = await createRdpClient(preview).getCsoStatus([ST("SVT01157"), ST("SVT01294")]);
  expect(requested().pathname).toBe("/staging/v1/cso/outfalls/status");
  expect(requested().searchParams.get("ids")).toBe(`${ST("SVT01157")},${ST("SVT01294")}`);
  expect(global.fetch.mock.calls[0][1].headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  expect(result.rows[0]).toMatchObject({ effectiveState: "not_spilling", sourceUpdatedAt: "2026-11-12T11:50:00.000Z", fetchedAt: "2026-11-12T11:52:00.000Z" });
  expect(result.rows[1]).toMatchObject({ status: "no_observations", sourceUpdatedAt: null });
});

test.each([
  [[]], [Array.from({ length: 21 }, (_, i) => ST(`SVT${i}`))], [[ST("A"), ST("A")]], [["SVT01157"]],
  [["severn-trent:storm-overflow-activity:bad id"]], ["SVT01157"],
])("status rejects unbounded or non-canonical ids before any request: %j", (ids) => {
  expect(() => createRdpClient(preview).getCsoStatus(ids)).toThrow("INVALID_QUERY");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test.each([
  ["reordered rows", statusResponse([status("B"), status("A")])],
  ["missing row", statusResponse([status("A")])],
  ["unknown enum", statusResponse([status("A", { effectiveState: "maybe" }), status("B")])],
  ["spilling without source time", statusResponse([status("A", { effectiveState: "spilling", sourceUpdatedAt: null }), status("B")])],
  ["offset-less timestamp", statusResponse([status("A", { sourceUpdatedAt: "2026-11-12 11:50" }), status("B")])],
])("status contract violation (%s) is RESPONSE_CONTRACT_ERROR", async (_name, body) => {
  global.fetch.mockResolvedValue(json(body));
  await expect(createRdpClient(preview).getCsoStatus([ST("A"), ST("B")])).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
});

test("events forward window, limit and cursor, and keep ongoing, unresolved and held events distinct", async () => {
  global.fetch.mockResolvedValue(json(eventsResponse("SVT01157", [
    event("SVT01157"),
    event("SVT01157", { eventId: "cse_" + "b".repeat(24), lifecycle: "ongoing", endedAt: null, startedAt: "2026-11-12T10:00:00Z" }),
    event("SVT01157", { eventId: "cse_" + "c".repeat(24), lifecycle: "unresolved", endedAt: null, boundaryProvenance: "end_not_reported",
      endNoLaterThan: "2026-11-11T10:00:00Z", startedAt: "2026-11-11T08:00:00Z", reconciliation: "held", heldClaims: 1 }),
  ], { nextCursor: CURSOR })));
  const result = await createRdpClient(preview).getCsoEvents(ST("SVT01157"), { ...window, limit: 100, cursor: CURSOR });
  expect(requested().pathname).toBe(`/staging/v1/cso/outfalls/${ST("SVT01157")}/events`);
  expect(Object.fromEntries(requested().searchParams)).toEqual({ ...window, limit: "100", cursor: CURSOR });
  expect(result.events.map((e) => [e.lifecycle, e.endedAt, e.reconciliation])).toEqual([
    ["completed", "2026-11-12T08:00:00.000Z", "resolved"], ["ongoing", null, "resolved"], ["unresolved", null, "held"]]);
  expect(result.nextCursor).toBe(CURSOR);
  expect(result.coverage).toMatchObject({ status: "partial", reportingCompleteness: "unverified" });
});

test.each([
  [{ from: "2026-11-12T00:00:00Z", to: "2026-11-12T00:00:00Z" }],
  [{ from: "2025-01-01T00:00:00Z", to: "2026-11-12T00:00:00Z" }],
  [{ from: "2026-11-12T00:00:00+01:00", to: "2026-11-12T06:00:00Z" }],
  [{ ...window, limit: 501 }], [{ ...window, limit: 0 }], [{ ...window, cursor: "short" }], [{ from: "yesterday", to: window.to }],
])("events reject unbounded windows and malformed paging before any request: %j", (query) => {
  expect(() => createRdpClient(preview).getCsoEvents(ST("SVT01157"), query)).toThrow("INVALID_QUERY");
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  ["another outfall's event", [event("OTHER")], {}],
  ["completed without a reported end", [event("SVT01157", { endedAt: null })], {}],
  ["ongoing with an end", [event("SVT01157", { lifecycle: "ongoing" })], {}],
  ["end before start", [event("SVT01157", { endedAt: "2026-11-12T05:00:00Z" })], {}],
  ["duplicate event id", [event("SVT01157"), event("SVT01157")], {}],
  ["unverified page", [], { pageIntegrity: "unverified" }],
  ["complete coverage claimed", [], { coverage: { status: "complete", reportingCompleteness: "unverified", gaps: [] } }],
])("events contract violation (%s) is rejected", async (_name, events, meta) => {
  const body = eventsResponse("SVT01157", events);
  Object.assign(body.meta, meta);
  global.fetch.mockResolvedValue(json(body));
  await expect(createRdpClient(preview).getCsoEvents(ST("SVT01157"), window)).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
});

test("empty events with unknown coverage stay unknown, never a zero-spill claim", async () => {
  global.fetch.mockResolvedValue(json(eventsResponse("SVT01157", [], { cover: { status: "unknown", collectedFrom: null,
    collectedTo: null, reportingCompleteness: "unverified", gaps: [{ ...window, reason: "not_collected" }] } })));
  const result = await createRdpClient(preview).getCsoEvents(ST("SVT01157"), window);
  expect(result.events).toEqual([]);
  expect(result.coverage).toMatchObject({ status: "unknown", gaps: [{ reason: "not_collected" }] });
});

test("catalogue validates identity composition and forwards paging", async () => {
  global.fetch.mockResolvedValueOnce(json(catalogue([asset("SVT01157")], { nextCursor: CURSOR, total: 2 })));
  const page = await createRdpClient(preview).listCsoOutfalls();
  expect(Object.fromEntries(requested().searchParams)).toEqual({ limit: "1000" });
  expect(page).toMatchObject({ total: 2, nextCursor: CURSOR, assets: [{ assetId: ST("SVT01157"), externalId: "SVT01157", selected: true }] });
  global.fetch.mockResolvedValueOnce(json(catalogue([{ ...asset("SVT01157"), externalId: "SVT09999" }])));
  await expect(createRdpClient(preview).listCsoOutfalls({ cursor: CURSOR })).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  expect(requested(1).searchParams.get("cursor")).toBe(CURSOR);
  expect(() => createRdpClient(preview).listCsoOutfalls({ limit: 1001 })).toThrow("INVALID_QUERY");
});

test("health keeps selection, catalogue and coverage conditions independent", async () => {
  global.fetch.mockResolvedValue(json(healthResponse("SVT01157", { selection: { state: "not_selected", sets: [], inVerifiedCatalogue: true } })));
  const health = await createRdpClient(preview).getCsoHealth(ST("SVT01157"));
  expect(requested().pathname).toBe(`/staging/v1/cso/outfalls/${ST("SVT01157")}/health`);
  expect(health).toMatchObject({ selection: { state: "not_selected" }, catalogue: { state: "Healthy" }, coverageLast24h: { status: "partial" } });
  global.fetch.mockResolvedValue(json(healthResponse("OTHER")));
  await expect(createRdpClient(preview).getCsoHealth(ST("SVT01157"))).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
});

test.each([
  [403, { error: { code: "FORBIDDEN", message: "x" } }, "AUTHORIZATION_FAILED", 1],
  [404, { error: { code: "ASSET_NOT_FOUND", message: "x" } }, "ASSET_NOT_FOUND", 1],
  [429, {}, "THROTTLED", 2],
  [503, { error: { code: "STORAGE_UNAVAILABLE", message: "secret detail" } }, "STORAGE_UNAVAILABLE", 2],
  [503, { error: { code: "ARCHIVE_INTEGRITY", message: "x" } }, "ARCHIVE_INTEGRITY", 1],
  [409, { error: { code: "CURSOR_STALE", message: "x" } }, "CURSOR_STALE", 1],
])("HTTP %i maps to a fixed code with bounded retries", async (statusCode, body, code, calls) => {
  global.fetch.mockImplementation(async () => json(body, statusCode));
  const error = await createRdpClient(preview).getCsoStatus([ST("A")]).catch((e) => e);
  expect(error).toMatchObject({ code, status: statusCode });
  expect(error.message).not.toContain("secret");
  expect(global.fetch).toHaveBeenCalledTimes(calls);
});

test("CSO bodies are size-bounded before parsing", async () => {
  global.fetch.mockResolvedValue(new Response("x".repeat(RIVER_MAX_BYTES + 1)));
  await expect(createRdpClient(preview).listCsoOutfalls()).rejects.toMatchObject({ code: "RESULT_TOO_LARGE" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("event detail and revisions are bounded, id-validated reads", async () => {
  const id = "cse_" + "a".repeat(24);
  global.fetch.mockResolvedValueOnce(json({ data: { event: event("SVT01157", { revision: 2 }), updatedAt: "2026-11-12T09:00:00Z",
    currentRevision: { revision: 2, changeReason: "end_corrected", recordedAt: "2026-11-12T09:00:00Z", claimId: "c", sourceFetchedAt: "2026-11-12T08:59:00Z", reconciliation: "automatic" },
    openHolds: [], archive: { archived: true, generation: 1 } }, meta: { retrievedAt: "2026-11-12T11:59:00Z" } }));
  const detail = await createRdpClient(preview).getCsoEvent(id);
  expect(requested().pathname).toBe(`/staging/v1/cso/events/${id}`);
  expect(detail).toMatchObject({ event: { assetId: ST("SVT01157"), revision: 2 }, archive: { archived: true, generation: 1 } });

  global.fetch.mockResolvedValueOnce(json({ data: [], meta: { eventId: id, assetId: ST("SVT01157"), currentRevision: 2, openHolds: [], nextCursor: CURSOR } }));
  const revisions = await createRdpClient(preview).getCsoEventRevisions(id, { limit: 50 });
  expect(requested(1).pathname).toBe(`/staging/v1/cso/events/${id}/revisions`);
  expect(Object.fromEntries(requested(1).searchParams)).toEqual({ limit: "50" });
  expect(revisions.nextCursor).toBe(CURSOR);

  expect(() => createRdpClient(preview).getCsoEvent("cse_../x")).toThrow("INVALID_QUERY");
  expect(() => createRdpClient(preview).getCsoEventRevisions(id, { limit: 201 })).toThrow("INVALID_QUERY");
  global.fetch.mockResolvedValueOnce(json({ error: { code: "EVENT_NOT_FOUND", message: "x" }, requestId: "r" }, 404));
  await expect(createRdpClient(preview).getCsoEvent(id)).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
});

describe("set activity (ADR-002 D3)", () => {
  test("signs one bounded GET for a page and parses status, events and coverage", async () => {
    global.fetch.mockResolvedValue(json(setActivityResponse([setActivityItem("SVT1", { events: [event("SVT1")] }), setActivityItem("SVT2", { events: null })],
      { total: 150, nextCursor: CURSOR })));
    const page = await createRdpClient(preview).getCsoSetActivity("hpp-catchment", { hours: 48, limit: 100, cursor: CURSOR });
    expect(requested().pathname).toBe("/staging/v1/cso/sets/hpp-catchment/activity");
    expect(Object.fromEntries(requested().searchParams)).toEqual({ hours: "48", limit: "100", cursor: CURSOR });
    expect(page).toMatchObject({ set: "hpp-catchment", total: 150, nextCursor: CURSOR, partial: false, windowHours: 48 });
    expect(page.items[0].events.events[0]).toMatchObject({ lifecycle: "completed", endedAt: "2026-11-12T08:00:00.000Z" });
    expect(page.items[0].events.coverage.status).toBe("partial");
    expect(page.items[1].events).toBeNull();
  });

  test.each([
    ["Bad set", {}], ["hpp-catchment", { hours: 0 }], ["hpp-catchment", { hours: 169 }], ["hpp-catchment", { limit: 101 }],
    ["hpp-catchment", { cursor: "short" }], ["../outfalls", {}],
  ])("rejects %s %j before any request", (set, options) => {
    expect(() => createRdpClient(preview).getCsoSetActivity(set, options)).toThrow("INVALID_QUERY");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ["another set", setActivityResponse([setActivityItem("SVT1")], { set: "bath-avon" })],
    ["another window", setActivityResponse([setActivityItem("SVT1")], { hours: 24 })],
    ["the same outfall twice in one page", setActivityResponse([setActivityItem("SVT1"), setActivityItem("SVT1")])],
    ["an outfall from another provider", (() => { const body = setActivityResponse([setActivityItem("SVT1")]); body.data[0].status.assetId = "wessex-water:storm-overflow-activity:SVT1"; return body; })()],
    ["an unverifiable spilling report", setActivityResponse([setActivityItem("SVT1", { status: { effectiveState: "spilling", sourceUpdatedAt: null } })])],
  ])("treats %s as a contract error", async (_, body) => {
    global.fetch.mockResolvedValue(json(body));
    await expect(createRdpClient(preview).getCsoSetActivity("hpp-catchment")).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  });

  test("maps a set not enabled on this stage to SET_NOT_FOUND without retrying", async () => {
    global.fetch.mockResolvedValue(json({ error: { code: "SET_NOT_FOUND", message: "x" }, requestId: "r" }, 404));
    await expect(createRdpClient(preview).getCsoSetActivity("hpp-catchment")).rejects.toMatchObject({ code: "SET_NOT_FOUND", status: 404 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
