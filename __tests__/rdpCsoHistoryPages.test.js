/** @jest-environment node */
import { createRdpClient } from "../libs/rdp/client";
import { connectToDatabase } from "../libs/database";
import { __resetRdpCsoStateForTests } from "../libs/rdp/csoSource";
import { CSO_HISTORY_MAX_OUTFALLS, CSO_HISTORY_MAX_PAGES, CSO_HISTORY_PAGE_LIMIT, historyWindow } from "../libs/rdp/csoHistory";
import {
  CSO_HISTORY_CURSOR_MAX_AGE_MS, CSO_HISTORY_PAGE_SIZE, paginateHistoryEvents, readHistoryCursor,
} from "../libs/rdp/csoHistoryPages";
import { getPublicCsoEventHistory } from "../libs/services/waterQualityService";
import { ST, NOW, asset } from "../testUtils/rdpCsoFixtures";

jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(), CSO_STATUS_BATCH_LIMIT: 20 }));

const MINUTE = 60000;
const id = (n) => `cse_${n.toString(16).padStart(24, "0")}`;
const at = (minutesBeforeNow) => new Date(NOW.getTime() - minutesBeforeNow * MINUTE).toISOString();
const ev = (n, minutesBeforeNow, overrides = {}) => ({ eventId: id(n), outfallId: "A", startedAt: at(minutesBeforeNow), display: "completed", ...overrides });
const read = (rowId, overrides = {}) => ({ id: rowId, state: "read", truncated: false, ...overrides });
const evidence = (overrides = {}) => ({ truncated: false, outfalls: { failed: 0, notRead: 0 }, ...overrides });
const historyOf = (events, overrides = {}) => ({ state: "available", window: historyWindow("7d", NOW), outfalls: [read("A"), read("B")],
  events, evidence: evidence(), ...overrides });
const decode = (cursor, { windowKey = "7d", outfall = null, basis = "legacy", now = NOW } = {}) => readHistoryCursor(cursor, { windowKey, outfall, basis, now });
const raw = (cursor) => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
const forge = (state) => Buffer.from(JSON.stringify(state)).toString("base64url");

// Walks every page of `historyAt()` (which may change between pages); returns the pages served.
function walk(historyAt, options = {}) {
  const pages = [];
  let continuation = null;
  for (let guard = 0; guard < 1000; guard++) {
    const result = paginateHistoryEvents(historyAt(pages.length), { basis: "legacy", continuation, ...options });
    pages.push(result);
    if (!result.page.nextCursor) return pages;
    continuation = decode(result.page.nextCursor, { outfall: options.outfall ?? null });
  }
  throw new Error("did not terminate");
}

describe("paginateHistoryEvents", () => {
  test("pages a large set newest first with no duplicates, gaps or misleading totals", () => {
    const events = Array.from({ length: 1234 }, (_, i) => ev(i, (i * 7) % 9000, { outfallId: i % 3 ? "A" : "B" }));
    const pages = walk(() => historyOf(events));
    expect(pages).toHaveLength(Math.ceil(1234 / CSO_HISTORY_PAGE_SIZE));
    const served = pages.flatMap((page) => page.events);
    expect(served).toHaveLength(1234);
    expect(new Set(served.map((event) => event.eventId)).size).toBe(1234);
    for (let i = 1; i < served.length; i++) {
      const [a, b] = [served[i - 1], served[i]];
      expect(a.startedAt > b.startedAt || (a.startedAt === b.startedAt && a.eventId < b.eventId)).toBe(true);
    }
    expect(pages.map((page) => page.page.offset)).toEqual(pages.map((_, i) => i * CSO_HISTORY_PAGE_SIZE));
    expect(pages.every((page) => page.page.total === 1234 && !page.page.totalIsLowerBound)).toBe(true);
    expect(pages[0].page).toMatchObject({ hasNewer: false, hasOlder: true });
    expect(pages.at(-1).page).toMatchObject({ hasNewer: true, hasOlder: false, nextCursor: null, returned: 1234 % CSO_HISTORY_PAGE_SIZE });
  });

  test("an exact multiple of the page size ends without an empty extra page", () => {
    const pages = walk(() => historyOf(Array.from({ length: CSO_HISTORY_PAGE_SIZE * 2 }, (_, i) => ev(i, i))));
    expect(pages.map((page) => page.page.returned)).toEqual([CSO_HISTORY_PAGE_SIZE, CSO_HISTORY_PAGE_SIZE]);
    expect(pages[1].page.nextCursor).toBeNull();
  });

  test("events sharing a start time are split across a page boundary by event ID", () => {
    const events = Array.from({ length: CSO_HISTORY_PAGE_SIZE + 5 }, (_, i) => ev(i, 60));
    const pages = walk(() => historyOf([...events].reverse()));
    expect(pages.flatMap((page) => page.events.map((event) => event.eventId))).toEqual(events.map((event) => event.eventId));
  });

  test("an empty list is one page with no navigation", () => {
    const [only] = walk(() => historyOf([]));
    expect(only.page).toMatchObject({ returned: 0, total: 0, hasOlder: false, hasNewer: false, nextCursor: null });
  });

  test("an outfall filter pages that outfall only and binds the cursor to it", () => {
    const events = Array.from({ length: 120 }, (_, i) => ev(i, i, { outfallId: i % 2 ? "A" : "B" }));
    const pages = walk(() => historyOf(events), { outfall: "B" });
    expect(pages.flatMap((page) => page.events).every((event) => event.outfallId === "B")).toBe(true);
    expect(pages.flatMap((page) => page.events)).toHaveLength(60);
    expect(pages[0]).toMatchObject({ outfallFilter: "B", page: { total: 60 } });
    // The same cursor is refused for another outfall or window: a changed query restarts at the newest events.
    expect(() => decode(pages[0].page.nextCursor)).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decode(pages[0].page.nextCursor, { outfall: "A" })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => decode(pages[0].page.nextCursor, { outfall: "B", windowKey: "30d" })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => paginateHistoryEvents(historyOf(events), { outfall: "Z", basis: "legacy" })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test("a duplicated event ID is listed once", () => {
    const result = paginateHistoryEvents(historyOf([ev(1, 10), ev(1, 10), ev(2, 20)]), { basis: "legacy" });
    expect(result.events.map((event) => event.eventId)).toEqual([id(1), id(2)]);
  });

  test("an ongoing event that ends between pages keeps its place; its new state is shown", () => {
    const events = Array.from({ length: 80 }, (_, i) => ev(i, i * 10, i === 60 ? { display: "ongoing", endedAt: null } : {}));
    const pages = walk((n) => historyOf(n === 0 ? events : events.map((event) => (event.eventId === id(60) ? { ...event, display: "completed", revision: 2 } : event))));
    expect(pages).toHaveLength(2);
    expect(pages[1].events.find((event) => event.eventId === id(60))).toMatchObject({ display: "completed", revision: 2 });
    expect(pages.flatMap((page) => page.events)).toHaveLength(80);
  });

  test("newer events recorded while browsing are reported, not mixed into older pages", () => {
    const events = Array.from({ length: 80 }, (_, i) => ev(i, 100 + i * 10));
    const pages = walk((n) => historyOf(n === 0 ? events : [ev(900, 5), ev(901, 6), ...events]));
    expect(pages[1].page).toMatchObject({ offset: CSO_HISTORY_PAGE_SIZE, newerSinceStart: 2, total: 80 });
    expect(pages[1].events.map((event) => event.eventId)).not.toContain(id(900));
    expect(pages.flatMap((page) => page.events)).toHaveLength(80);
  });

  test.each([
    ["an already-listed event's start is corrected to later in the list", (events) => events.map((event) => (event.eventId === id(10) ? { ...event, startedAt: at(10 * 10 + 5000) } : event))],
    ["an unlisted event's start is corrected into the listed part", (events) => events.map((event) => (event.eventId === id(70) ? { ...event, startedAt: at(15) } : event))],
    ["a listed event disappears", (events) => events.filter((event) => event.eventId !== id(3))],
    ["a late report lands among listed events", (events) => [...events, ev(950, 33)]],
  ])("refuses to continue when %s (409), never duplicating or skipping", (_, change) => {
    const events = Array.from({ length: 80 }, (_, i) => ev(i, i * 10));
    const first = paginateHistoryEvents(historyOf(events), { basis: "legacy" });
    const continuation = decode(first.page.nextCursor);
    expect(() => paginateHistoryEvents(historyOf(change(events)), { basis: "legacy", continuation }))
      .toThrow(expect.objectContaining({ statusCode: 409 }));
  });

  test("a correction confined to events not yet listed simply reorders them", () => {
    const events = Array.from({ length: 80 }, (_, i) => ev(i, i * 10));
    const pages = walk((n) => historyOf(n === 0 ? events : events.map((event) => (event.eventId === id(70) ? { ...event, startedAt: at(785) } : event))));
    const served = pages.flatMap((page) => page.events.map((event) => event.eventId));
    expect(served).toHaveLength(80);
    expect(new Set(served).size).toBe(80);
  });

  test("the total is a lower bound whenever some history was not read", () => {
    const events = [ev(1, 10), ev(2, 20, { outfallId: "B" })];
    const page = (overrides, outfall) => paginateHistoryEvents(historyOf(events, overrides), { basis: "legacy", outfall }).page.totalIsLowerBound;
    expect(page({})).toBe(false);
    expect(page({ evidence: evidence({ truncated: true }) })).toBe(true);
    expect(page({ evidence: evidence({ outfalls: { failed: 1, notRead: 0 } }) })).toBe(true);
    expect(page({ evidence: evidence({ outfalls: { failed: 0, notRead: 3 } }) })).toBe(true);
    // A filtered outfall is judged by its own read.
    const outfalls = [read("A", { truncated: true, readThrough: at(10) }), read("B")];
    expect(page({ outfalls, evidence: evidence({ truncated: true }) }, "B")).toBe(false);
    expect(page({ outfalls, evidence: evidence({ truncated: true }) }, "A")).toBe(true);
    expect(page({ outfalls: [read("A"), { id: "B", state: "failed" }] }, "B")).toBe(true);
  });

  test("an unavailable continuation is reported as unavailable, not as a changed list", () => {
    const first = paginateHistoryEvents(historyOf(Array.from({ length: 80 }, (_, i) => ev(i, i))), { basis: "legacy" });
    const result = paginateHistoryEvents(historyOf([], { state: "unavailable" }), { basis: "legacy", continuation: decode(first.page.nextCursor) });
    expect(result).toMatchObject({ state: "unavailable", events: [] });
  });

  test("a moving set window is flagged on continuation", () => {
    const window = { key: "48h", hours: 48, from: "2026-11-10T11:58:10.000Z", to: "2026-11-12T11:58:30.000Z" };
    const events = Array.from({ length: 80 }, (_, i) => ev(i, i * 10));
    const first = paginateHistoryEvents(historyOf(events, { window }), { basis: "rdp" });
    const continuation = readHistoryCursor(first.page.nextCursor, { windowKey: "48h", basis: "rdp", now: NOW });
    expect(continuation.pinnedWindow).toBeNull();
    const moved = { ...window, from: "2026-11-10T12:08:10.000Z", to: "2026-11-12T12:08:30.000Z" };
    expect(paginateHistoryEvents(historyOf(events, { window: moved }), { basis: "rdp", continuation }).page.windowMoved).toBe(true);
  });
});

describe("readHistoryCursor", () => {
  const cursor = () => paginateHistoryEvents(historyOf(Array.from({ length: 80 }, (_, i) => ev(i, i))), { basis: "legacy" }).page.nextCursor;

  test("pins the window the first page read", () => {
    expect(decode(cursor())).toMatchObject({ pinnedWindow: historyWindow("7d", NOW), served: CSO_HISTORY_PAGE_SIZE });
  });

  test.each([
    ["garbage", () => "not a cursor!"],
    ["non-JSON", () => Buffer.from("{").toString("base64url")],
    ["an oversized value", () => "a".repeat(5000)],
    ["a widened window", () => forge({ ...raw(cursor()), f: "2026-10-01T12:00:00Z" })],
    ["an unaligned window", () => forge({ ...raw(cursor()), f: "2026-11-05T12:07:00Z", t: "2026-11-12T12:07:00Z" })],
    ["a future window", () => forge({ ...raw(cursor()), f: "2026-11-20T12:00:00Z", t: "2026-11-27T12:00:00Z" })],
    ["a malformed event ID", () => forge({ ...raw(cursor()), e: "../../v1/measurements" })],
    ["a negative position", () => forge({ ...raw(cursor()), n: -1 })],
    ["an unknown version", () => forge({ ...raw(cursor()), v: 2 })],
  ])("rejects %s with 400", (_, make) => {
    expect(() => decode(make())).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  test("an old or other-membership cursor expires (410) so the visitor restarts", () => {
    const later = new Date(NOW.getTime() + CSO_HISTORY_CURSOR_MAX_AGE_MS + 60 * MINUTE);
    expect(() => decode(cursor(), { now: later })).toThrow(expect.objectContaining({ statusCode: 410 }));
    expect(() => decode(cursor(), { basis: "rdp" })).toThrow(expect.objectContaining({ statusCode: 410 }));
  });
});

// The public service over a fake RDP client: every page re-reads the same pinned window, bounded per outfall.
describe("getPublicCsoEventHistory continuation", () => {
  const ids = Array.from({ length: 22 }, (_, i) => `SVT${String(i).padStart(2, "0")}`);
  const rdpEvent = (n, minutesBeforeNow) => ({ eventId: id(n), startedAt: at(minutesBeforeNow), endedAt: at(minutesBeforeNow - 30), endNoLaterThan: null,
    lifecycle: "completed", boundaryProvenance: "provider_reported", revision: 1, reconciliation: "resolved", heldClaims: 0, tier: "hot" });
  let client;

  function mockMembership(list) {
    const latest = { id: "wq-1", scrape_timestamp: new Date("2026-11-12T11:50:00Z"), water_quality: { CSO_IDs: list } };
    const waterQuality = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(latest) }) }) }) };
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => waterQuality) } });
  }

  // Each outfall has `perOutfall(index)` events, served oldest first in pages of `limit` with a numeric cursor, as RDP does.
  function fakeRdp(perOutfall) {
    const byAsset = new Map(ids.map((externalId, index) => [ST(externalId), Array.from({ length: perOutfall(index) }, (_, k) => rdpEvent(index * 10000 + k, 5 + k * 13 + index))
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))]));
    return {
      listCsoOutfalls: jest.fn(async () => ({ assets: ids.map((externalId) => asset(externalId)), total: ids.length, catalogues: [], nextCursor: null })),
      getCsoEvents: jest.fn(async (assetId, { from, to, limit, cursor }) => {
        const list = byAsset.get(assetId).filter((event) => event.startedAt < to && event.endedAt > from);
        const start = cursor ? Number(cursor) : 0;
        return { events: list.slice(start, start + limit), coverage: { status: "partial", collectedFrom: from, collectedTo: to, reportingCompleteness: "unverified", gaps: [] },
          requestAsOf: NOW.toISOString(), nextCursor: start + limit < list.length ? String(start + limit) : null };
      }),
    };
  }

  const originalEnv = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    __resetRdpCsoStateForTests();
    process.env = { ...originalEnv, RDP_CSO_HISTORY: "on" };
    mockMembership(ids);
  });
  afterEach(() => { jest.useRealTimers(); process.env = originalEnv; });

  test("every page reads the first page's window with bounded work, and the walk covers every read event once", async () => {
    client = fakeRdp((index) => (index === 0 ? CSO_HISTORY_PAGE_LIMIT * CSO_HISTORY_MAX_PAGES + 40 : 30));
    createRdpClient.mockImplementation(() => client);
    const first = await getPublicCsoEventHistory("7d");
    const window = historyWindow("7d", NOW);
    expect(first.window).toEqual(window);
    // The 20-outfall read limit applies: two members are reported as not read, so every total is "or more".
    expect(first.evidence.outfalls).toMatchObject({ read: CSO_HISTORY_MAX_OUTFALLS, notRead: 2 });
    expect(first.page).toMatchObject({ offset: 0, returned: CSO_HISTORY_PAGE_SIZE, totalIsLowerBound: true });
    // The busiest outfall stopped at its read budget; its newest events after `readThrough` are the missing ones.
    expect(first.outfalls[0]).toMatchObject({ truncated: true, readThrough: expect.any(String) });

    const served = [...first.events];
    let page = first;
    // Time passes: the bucketed window has moved on, but the traversal keeps its own window.
    jest.setSystemTime(new Date(NOW.getTime() + 40 * MINUTE));
    while (page.page.nextCursor) {
      client.getCsoEvents.mockClear();
      page = await getPublicCsoEventHistory("7d", { cursor: page.page.nextCursor });
      expect(client.getCsoEvents.mock.calls.length).toBeLessThanOrEqual(CSO_HISTORY_MAX_OUTFALLS * CSO_HISTORY_MAX_PAGES);
      expect(client.getCsoEvents.mock.calls.every(([, query]) => query.from === window.from && query.to === window.to)).toBe(true);
      served.push(...page.events);
    }
    const total = CSO_HISTORY_PAGE_LIMIT * CSO_HISTORY_MAX_PAGES + (CSO_HISTORY_MAX_OUTFALLS - 1) * 30;
    expect(served).toHaveLength(total);
    expect(new Set(served.map((event) => event.eventId)).size).toBe(total);
    expect(page.page).toMatchObject({ hasOlder: false, nextCursor: null, total, totalIsLowerBound: true });
  });

  test("a cursor is refused for another outfall filter", async () => {
    client = fakeRdp(() => 60);
    createRdpClient.mockImplementation(() => client);
    const first = await getPublicCsoEventHistory("7d");
    await expect(getPublicCsoEventHistory("7d", { cursor: first.page.nextCursor, outfall: "SVT01" })).rejects.toMatchObject({ statusCode: 400 });
    const filtered = await getPublicCsoEventHistory("7d", { outfall: "SVT01" });
    expect(filtered.page).toMatchObject({ total: 60, returned: CSO_HISTORY_PAGE_SIZE, totalIsLowerBound: false });
    const rest = await getPublicCsoEventHistory("7d", { outfall: "SVT01", cursor: filtered.page.nextCursor });
    expect(rest.page).toMatchObject({ offset: CSO_HISTORY_PAGE_SIZE, returned: 10, hasOlder: false });
    expect(rest.events.every((event) => event.outfallId === "SVT01")).toBe(true);
  });
});
