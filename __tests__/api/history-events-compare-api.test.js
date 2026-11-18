/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../../libs/history/historyService", () => {
  const actual = jest.requireActual("../../libs/history/historyService");
  return { describeHistoryError: actual.describeHistoryError, getEventComparison: jest.fn() };
});
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const { RdpError } = require("../../libs/rdp/errors");
const { getEventComparison } = require("../../libs/history/historyService");
const compare = require("../../app/api/history/colwick/events/compare/route");

const request = (query) => ({ url: `http://localhost/api/history/colwick/events/compare${query}` });
const slot = (extra = {}) => ({ found: true, match: "exact", inProgress: false, window: { monthsFailed: [] }, readings: [], ...extra });
const ready = (extra = {}) => ({ ready: true, sameEvent: false, inProgress: false, monthsFailed: [], events: [slot(), slot()], ...extra });

beforeEach(() => jest.clearAllMocks());

describe("event comparison route", () => {
  test.each([
    ["no ids", ""],
    ["one id", "?a=20240102T0315Z"],
    ["a malformed id", "?a=20240102T0315Z&b=2024-01-02"],
    ["an impossible instant", "?a=20241340T0000Z&b=20240102T0315Z"],
  ])("rejects %s before reading", async (_name, query) => {
    const response = await compare.GET(request(query));
    expect(response.status).toBe(400);
    expect(getEventComparison).not.toHaveBeenCalled();
  });

  test("rejects the same event twice with an explicit reason", async () => {
    const response = await compare.GET(request("?a=20240102T0315Z&b=20240102T0315Z"));
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.reason).toBe("same_event");
    expect(getEventComparison).not.toHaveBeenCalled();
  });

  test("two completed events are cached for an hour", async () => {
    getEventComparison.mockResolvedValue(ready());
    const response = await compare.GET(request("?a=20240102T0315Z&b=20200209T1200Z"));
    expect(response.status).toBe(200);
    expect(getEventComparison).toHaveBeenCalledWith(["20240102T0315Z", "20200209T1200Z"]);
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=3600, stale-while-revalidate=86400");
  });

  test("an event touching the current month follows the in-progress cadence", async () => {
    getEventComparison.mockResolvedValue(ready({ inProgress: true }));
    expect((await compare.GET(request("?a=20240102T0315Z&b=20261101T0000Z"))).headers["Cache-Control"]).toContain("s-maxage=900");
  });

  test.each([
    ["an unresolved selection", ready({ ready: false, events: [{ found: false, match: "not_found" }, slot()] })],
    ["the same resolved event", ready({ ready: false, sameEvent: true })],
    ["an unreadable month in a window", ready({ events: [slot({ window: { monthsFailed: [{ year: 2024, month: 1 }] } }), slot()] })],
    ["an unreadable month in the index", ready({ monthsFailed: [{ year: 2020, month: 2 }] })],
  ])("%s is served but cached briefly", async (_name, data) => {
    getEventComparison.mockResolvedValue(data);
    const response = await compare.GET(request("?a=20240102T0315Z&b=20200209T1200Z"));
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toContain("s-maxage=60");
  });

  test("archive failures map to fixed public reasons, never an empty comparison", async () => {
    getEventComparison.mockRejectedValue(new RdpError("THROTTLED"));
    const response = await compare.GET(request("?a=20240102T0315Z&b=20200209T1200Z"));
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ ok: false, error: { details: { reason: "temporary" } } });
    expect(payload).not.toHaveProperty("data");
  });
});
