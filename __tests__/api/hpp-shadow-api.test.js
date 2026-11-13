/** @jest-environment node */
jest.mock("../../libs/services/hppShadowCronService");

const { getServerSession } = require("next-auth");
const { runHppShadowCron, getHppShadowReport } = require("../../libs/services/hppShadowCronService");
const { HttpError } = require("../../libs/api/http");
const runRoute = require("../../app/api/internal/hpp/run/route");
const adminRoute = require("../../app/api/admin/hpp-shadow/route");

describe("HPP shadow cron route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: "secret-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("returns 401 and does not run without the cron secret", async () => {
    const res = await runRoute.GET({ headers: { authorization: "Bearer wrong" } });
    expect(res.status).toBe(401);
    expect(runHppShadowCron).not.toHaveBeenCalled();
  });

  test("runs one shadow evaluation with a unique run id when authorized", async () => {
    runHppShadowCron.mockResolvedValue({ mode: "shadow", ran: true, action: "none" });
    const res = await runRoute.GET({ headers: { authorization: "Bearer secret-123" } });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mode: "shadow", ran: true, action: "none" });
    expect(runHppShadowCron).toHaveBeenCalledWith({ runId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  test("maps an invalid mode to its message without detail", async () => {
    runHppShadowCron.mockRejectedValue(new HttpError(500, "Invalid HPP status source"));
    const res = await runRoute.GET({ headers: { authorization: "Bearer secret-123" } });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: { message: "Invalid HPP status source" } });
  });

  test("keeps the function duration below the shadow lease", () => {
    expect(runRoute.maxDuration).toBeLessThanOrEqual(60);
  });
});

describe("HPP shadow admin report route", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns 401 without reading when unauthenticated", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await adminRoute.GET();
    expect(res.status).toBe(401);
    expect(getHppShadowReport).not.toHaveBeenCalled();
  });

  test("returns the shadow report to an authenticated operator", async () => {
    getServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    getHppShadowReport.mockResolvedValue({ mode: "shadow", status: "ok" });
    const res = await adminRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ mode: "shadow", status: "ok" });
  });

  test("downloads the acceptance timeline as CSV when asked", async () => {
    getServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    getHppShadowReport.mockResolvedValue({
      mode: "shadow", status: "ok", generatedAt: "2026-11-13T12:00:00.000Z",
      acceptance: { checks: [{ id: "evidence_window", status: "pending", detail: "0.0 of 48 hours" }], pairing: { pairs: [], unpairedLegacy: [], unpairedShadow: [] }, gaps: [], closureDays: [] },
    });
    const res = await adminRoute.GET({ nextUrl: new URL("https://example.test/api/admin/hpp-shadow?format=csv") });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("hpp-shadow-acceptance-2026-11-13.csv");
    expect(await res.text()).toContain("check,evidence_window,pending,,,,,0.0 of 48 hours");
  });
});
