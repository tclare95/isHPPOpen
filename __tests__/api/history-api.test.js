/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../../libs/history/historyService", () => {
  const actual = jest.requireActual("../../libs/history/historyService");
  return {
    describeHistoryError: actual.describeHistoryError,
    getMonthHistory: jest.fn(),
    getYearHistory: jest.fn(),
    getHistoryOverview: jest.fn(),
  };
});
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

const { RdpError } = require("../../libs/rdp/errors");
const { getHistoryOverview, getMonthHistory, getYearHistory } = require("../../libs/history/historyService");
const month = require("../../app/api/history/colwick/month/route");
const year = require("../../app/api/history/colwick/year/route");
const overview = require("../../app/api/history/colwick/overview/route");

const request = (path) => new Request(`http://localhost${path}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: Date.parse("2026-11-05T12:00:00Z") });
});
afterEach(() => jest.useRealTimers());

describe("month route", () => {
  test.each([
    "/api/history/colwick/month?year=2024",
    "/api/history/colwick/month?year=2015&month=1",
    "/api/history/colwick/month?year=2024&month=13",
    "/api/history/colwick/month?year=2026&month=12",
    "/api/history/colwick/month?year=2024.5&month=1",
    "/api/history/colwick/month?year=abc&month=1",
  ])("rejects %s before reading history", async (path) => {
    const response = await month.GET(request(path));
    expect(response.status).toBe(400);
    expect(getMonthHistory).not.toHaveBeenCalled();
  });

  test("returns a completed month with a long CDN cache", async () => {
    getMonthHistory.mockResolvedValue({ period: { inProgress: false }, summary: {} });
    const response = await month.GET(request("/api/history/colwick/month?year=2024&month=11"));
    expect(response.status).toBe(200);
    expect(getMonthHistory).toHaveBeenCalledWith(2024, 11);
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=3600, stale-while-revalidate=86400");
    expect((await response.json()).ok).toBe(true);
  });

  test("the current month uses the operational cache window", async () => {
    getMonthHistory.mockResolvedValue({ period: { inProgress: true } });
    const response = await month.GET(request("/api/history/colwick/month?year=2026&month=11"));
    expect(response.headers["Cache-Control"]).toContain("s-maxage=900");
  });

  test("an archive integrity failure is a distinct 503, not empty data", async () => {
    getMonthHistory.mockRejectedValue(new RdpError("ARCHIVE_INTEGRITY", 503));
    const response = await month.GET(request("/api/history/colwick/month?year=2020&month=2"));
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ ok: false, error: { details: { reason: "integrity", code: "ARCHIVE_INTEGRITY" } } });
    expect(payload).not.toHaveProperty("data");
  });
});

describe("year route", () => {
  test("partial years are cached briefly so failed months are retried", async () => {
    getYearHistory.mockResolvedValue({ period: { inProgress: false }, months: [{ status: "available" }, { status: "read_failed" }] });
    const response = await year.GET(request("/api/history/colwick/year?year=2024"));
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toContain("s-maxage=60");
  });

  test("rejects future years", async () => {
    expect((await year.GET(request("/api/history/colwick/year?year=2027"))).status).toBe(400);
  });
});

describe("overview route", () => {
  test("serves partial overviews with a short cache", async () => {
    getHistoryOverview.mockResolvedValue({ monthsFailed: 3 });
    const response = await overview.GET();
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toContain("s-maxage=60");
  });

  test("maps unavailable configuration to 503", async () => {
    getHistoryOverview.mockRejectedValue(new RdpError("CONFIGURATION_ERROR"));
    const response = await overview.GET();
    expect(response.status).toBe(503);
    expect((await response.json()).error.details.reason).toBe("unavailable");
  });
});
