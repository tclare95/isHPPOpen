/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../../libs/history/historyService", () => {
  const actual = jest.requireActual("../../libs/history/historyService");
  return { describeHistoryError: actual.describeHistoryError, getEventsIndex: jest.fn(), getEventDetail: jest.fn() };
});
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const { RdpError } = require("../../libs/rdp/errors");
const { getEventDetail, getEventsIndex } = require("../../libs/history/historyService");
const index = require("../../app/api/history/colwick/events/route");
const detail = require("../../app/api/history/colwick/events/[id]/route");

const context = (id) => ({ params: Promise.resolve({ id }) });

beforeEach(() => jest.clearAllMocks());

describe("events index route", () => {
  test("serves events with the in-progress cache window", async () => {
    getEventsIndex.mockResolvedValue({ events: [], monthsFailed: [] });
    const response = await index.GET();
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=900, stale-while-revalidate=86400");
  });

  test("a partial index is cached briefly so failed months are retried", async () => {
    getEventsIndex.mockResolvedValue({ events: [], monthsFailed: [{ year: 2020, month: 2, error: "THROTTLED" }] });
    expect((await index.GET()).headers["Cache-Control"]).toContain("s-maxage=60");
  });

  test("an archive failure is a distinct error, never an empty event list", async () => {
    getEventsIndex.mockRejectedValue(new RdpError("PAGINATION_LIMIT"));
    const response = await index.GET();
    const payload = await response.json();
    expect(response.status).toBe(502);
    expect(payload).toMatchObject({ ok: false, error: { details: { reason: "unreliable" } } });
    expect(payload).not.toHaveProperty("data");
  });
});

describe("event detail route", () => {
  test.each(["2024-01-02", "20240102T0315", "20241340T0000Z", "../etc"])("rejects id %s before reading", async (id) => {
    const response = await detail.GET(null, context(id));
    expect(response.status).toBe(400);
    expect(getEventDetail).not.toHaveBeenCalled();
  });

  test("a completed event is cached for an hour", async () => {
    getEventDetail.mockResolvedValue({ found: true, inProgress: false, monthsFailed: [], window: { monthsFailed: [] } });
    const response = await detail.GET(null, context("20240102T0315Z"));
    expect(response.status).toBe(200);
    expect(getEventDetail).toHaveBeenCalledWith("20240102T0315Z");
    expect(response.headers["Cache-Control"]).toContain("s-maxage=3600");
  });

  test("an event with unreadable surrounding months is cached briefly", async () => {
    getEventDetail.mockResolvedValue({ found: true, inProgress: false, monthsFailed: [], window: { monthsFailed: [{ year: 2024, month: 1 }] } });
    expect((await detail.GET(null, context("20240102T0315Z"))).headers["Cache-Control"]).toContain("s-maxage=60");
  });

  test("an id that no longer matches any event is a 404 that explains revisions", async () => {
    getEventDetail.mockResolvedValue({ found: false, match: "not_found", monthsFailed: [] });
    const response = await detail.GET(null, context("20240102T0315Z"));
    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.error).toMatchObject({ details: { reason: "not_found" } });
    expect(payload.error.message).toMatch(/revisions/);
  });

  test("temporary archive failures map to 503", async () => {
    getEventDetail.mockRejectedValue(new RdpError("THROTTLED"));
    const response = await detail.GET(null, context("20240102T0315Z"));
    expect(response.status).toBe(503);
    expect((await response.json()).error.details.reason).toBe("temporary");
  });
});
