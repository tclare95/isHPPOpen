jest.mock("../../libs/rdp/csoSource", () => ({ getCsoShadowReport: jest.fn() }));

const { getServerSession } = require("next-auth");
const { getCsoShadowReport } = require("../../libs/rdp/csoSource");
const { HttpError } = require("../../libs/api/http");
const route = require("../../app/api/admin/cso-shadow/route");

describe("CSO shadow diagnostic route", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns 401 without a session and never reads RDP", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await route.GET();
    expect(res.status).toBe(401);
    expect(getCsoShadowReport).not.toHaveBeenCalled();
  });

  test("returns the read-only report for an authenticated session", async () => {
    getServerSession.mockResolvedValue({ user: { email: "admin@example.com" } });
    const report = { comparedAt: "2026-11-12T12:00:00.000Z", summary: { members: 1, outcomes: { match: 1 } }, locations: [] };
    getCsoShadowReport.mockResolvedValue(report);
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(report);
    expect(route.dynamic).toBe("force-dynamic");
  });

  test("maps a missing summary without leaking detail", async () => {
    getServerSession.mockResolvedValue({ user: {} });
    getCsoShadowReport.mockRejectedValue(new HttpError(404, "No water quality summary available"));
    const res = await route.GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { message: "No water quality summary available" } });
  });
});
