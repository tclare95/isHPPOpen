/** @jest-environment node */
/**
 * Admin authorization contract for every privileged API route.
 *
 * The inventory test scans app/api so a new mutating handler, or any handler under app/api/admin,
 * fails CI until it is classified here as admin-only (and proven to enforce requireRouteAdmin) or
 * explicitly exempt with a reason.
 */
const fs = require("node:fs");
const path = require("node:path");

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));
jest.mock("../../libs/services/eventsService");
jest.mock("../../libs/services/siteBannerService");
jest.mock("../../libs/services/hppShadowCronService");
jest.mock("../../libs/rdp/csoSource", () => ({ getCsoShadowReport: jest.fn() }));
jest.mock("../../libs/services/levelsService", () => ({ getLatestLevelsSnapshot: jest.fn() }));
jest.mock("../../libs/services/forecastService", () => ({ getLatestForecastSnapshot: jest.fn() }));
jest.mock("../../libs/services/hppStatusService", () => ({ getHppStatusSnapshot: jest.fn() }));
jest.mock("../../libs/services/waterQualityAssessmentService", () => ({ getWaterQualityAssessmentHealth: jest.fn() }));
jest.mock("../../libs/services/trentWeirsService", () => ({ getTrentWeirsSnapshot: jest.fn() }));
jest.mock("../../libs/services/operationalOverviewService", () => ({ getOperationalOverview: jest.fn() }));

const { getServerSession } = require("next-auth");
const eventsService = require("../../libs/services/eventsService");
const siteBannerService = require("../../libs/services/siteBannerService");
const { getHppShadowReport } = require("../../libs/services/hppShadowCronService");
const { getCsoShadowReport } = require("../../libs/rdp/csoSource");
const { getLatestLevelsSnapshot } = require("../../libs/services/levelsService");
const { getOperationalOverview } = require("../../libs/services/operationalOverviewService");
const { resetAdminAccessDiagnosticsForTests } = require("../../libs/auth/adminAccess");
const { adminSession, nonAdminSession } = require("../../testUtils/adminSessions");

const API_ROOT = path.join(__dirname, "../../app/api");
const MUTATING = ["POST", "PUT", "PATCH", "DELETE"];

const banner = {
  banner_title: "Update",
  banner_message: "Message",
  banner_enabled: true,
  banner_start_date: "2026-03-08T10:00:00.000Z",
  banner_end_date: null,
};

const EVENT_ID = "650000000000000000000001";

const request = (url, body) => ({ nextUrl: new URL(url), async json() { return body; } });

/** Every admin-only handler, with a request that would succeed for an admin and the work it must not do otherwise. */
const ADMIN_ROUTES = [
  {
    route: "admin/cso-shadow", method: "GET",
    load: () => require("../../app/api/admin/cso-shadow/route"),
    request: () => request("http://localhost/api/admin/cso-shadow"),
    arrange: () => getCsoShadowReport.mockResolvedValue({ summary: {}, locations: [] }),
    work: () => getCsoShadowReport,
  },
  {
    route: "admin/hpp-shadow", method: "GET",
    load: () => require("../../app/api/admin/hpp-shadow/route"),
    request: () => request("http://localhost/api/admin/hpp-shadow"),
    arrange: () => getHppShadowReport.mockResolvedValue({ generatedAt: "2026-11-17T00:00:00.000Z" }),
    work: () => getHppShadowReport,
  },
  {
    route: "admin/operational-health", method: "GET",
    load: () => require("../../app/api/admin/operational-health/route"),
    request: () => request("http://localhost/api/admin/operational-health"),
    arrange: () => getLatestLevelsSnapshot.mockResolvedValue({ health: { state: "fresh" } }),
    work: () => getLatestLevelsSnapshot,
  },
  {
    route: "admin/operational-overview", method: "GET",
    load: () => require("../../app/api/admin/operational-overview/route"),
    request: () => request("http://localhost/api/admin/operational-overview"),
    arrange: () => getOperationalOverview.mockResolvedValue({ checkedAt: "2026-11-18T12:00:00.000Z", components: [] }),
    work: () => getOperationalOverview,
  },
  {
    route: "admin/events", method: "GET",
    load: () => require("../../app/api/admin/events/route"),
    request: () => request("http://localhost/api/admin/events?scope=past"),
    arrange: () => eventsService.listAdminEvents.mockResolvedValue({ events: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }),
    work: () => eventsService.listAdminEvents,
  },
  {
    route: "admin/events", method: "POST",
    load: () => require("../../app/api/admin/events/route"),
    request: () => request("http://localhost/api/admin/events", { name: "Race" }),
    okStatus: 201,
    arrange: () => eventsService.createEvent.mockResolvedValue({ id: EVENT_ID }),
    work: () => eventsService.createEvent,
  },
  {
    route: "admin/events/[id]", method: "PUT",
    load: () => require("../../app/api/admin/events/[id]/route"),
    request: () => request(`http://localhost/api/admin/events/${EVENT_ID}`, { name: "Race" }),
    context: () => ({ params: Promise.resolve({ id: EVENT_ID }) }),
    arrange: () => eventsService.updateEventById.mockResolvedValue({ event: { id: EVENT_ID }, changed: true }),
    work: () => eventsService.updateEventById,
  },
  {
    route: "admin/events/[id]", method: "DELETE",
    load: () => require("../../app/api/admin/events/[id]/route"),
    request: () => request(`http://localhost/api/admin/events/${EVENT_ID}`),
    context: () => ({ params: Promise.resolve({ id: EVENT_ID }) }),
    arrange: () => eventsService.deleteEventById.mockResolvedValue({ id: EVENT_ID }),
    work: () => eventsService.deleteEventById,
  },
  {
    route: "sitebanner", method: "POST",
    load: () => require("../../app/api/sitebanner/route"),
    request: () => request("http://localhost/api/sitebanner", banner),
    arrange: () => siteBannerService.upsertBanner.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 }),
    work: () => siteBannerService.upsertBanner,
  },
];

/** Mutating handlers that are intentionally not admin-only. Changing their auth needs its own review. */
const NON_ADMIN_MUTATIONS = {
  "alerts POST": "public alert signup; double opt-in confirmation token",
  "alerts/manage DELETE": "subscriber management token (alerts workstream)",
  "alerts/manage PATCH": "subscriber edit/pause/resume; same management token as DELETE",
  "alerts/manage-link POST": "public, rate-limited management-link email request",
  "auth/[...nextauth] POST": "NextAuth sign-in/sign-out protocol endpoint",
  "trentlockapi POST": "public Trent Lock level lookup used by /trentlock",
};

function listRouteFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(full);
    return entry.name === "route.js" ? [full] : [];
  });
}

function exportedMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    methods.add(match[1]);
  }
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const alias of block[1].matchAll(/\bas\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) methods.add(alias[1]);
  }
  return [...methods];
}

const inventory = listRouteFiles(API_ROOT).map((file) => ({
  route: path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/"),
  source: fs.readFileSync(file, "utf8"),
}));

const privilegedCandidates = inventory.flatMap(({ route, source }) => exportedMethods(source)
  .filter((method) => MUTATING.includes(method) || route.startsWith("admin/"))
  .map((method) => `${route} ${method}`));

describe("privileged route inventory", () => {
  const adminKeys = new Set(ADMIN_ROUTES.map(({ route, method }) => `${route} ${method}`));

  test("finds the known mutating and admin handlers", () => {
    expect(privilegedCandidates.length).toBeGreaterThanOrEqual(adminKeys.size);
  });

  test.each(privilegedCandidates)("%s is classified as admin-only or explicitly exempt", (key) => {
    expect(adminKeys.has(key) || Object.hasOwn(NON_ADMIN_MUTATIONS, key)).toBe(true);
  });

  test.each([...new Set(ADMIN_ROUTES.map(({ route }) => route))])("%s enforces requireRouteAdmin, not a bare session check", (route) => {
    const { source } = inventory.find((entry) => entry.route === route);
    expect(source).toContain("requireRouteAdmin()");
    expect(source).not.toContain("requireRouteSession");
  });

  test("every classified route still exists", () => {
    const present = new Set(inventory.flatMap(({ route, source }) => exportedMethods(source).map((method) => `${route} ${method}`)));
    for (const key of [...adminKeys, ...Object.keys(NON_ADMIN_MUTATIONS)]) expect(present.has(key)).toBe(true);
  });
});

describe.each(ADMIN_ROUTES.map((entry) => [`${entry.method} /api/${entry.route}`, entry]))("%s authorization", (_label, entry) => {
  const originalAllowlist = process.env.ADMIN_AUTH0_SUBS;
  const call = () => entry.load()[entry.method](entry.request(), entry.context?.());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    resetAdminAccessDiagnosticsForTests();
    process.env.ADMIN_AUTH0_SUBS = originalAllowlist;
    entry.arrange();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => { process.env.ADMIN_AUTH0_SUBS = originalAllowlist; });

  const setAllowlist = (value) => {
    if (value === undefined) delete process.env.ADMIN_AUTH0_SUBS;
    else process.env.ADMIN_AUTH0_SUBS = value;
  };

  test("returns 401 when unauthenticated and does no work", async () => {
    getServerSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: { message: "Unauthorized" } });
    expect(entry.work()).not.toHaveBeenCalled();
  });

  test("allowlist set: allows a member", async () => {
    getServerSession.mockResolvedValue(adminSession());
    const res = await call();
    expect(res.status).toBe(entry.okStatus ?? 200);
    expect(entry.work()).toHaveBeenCalled();
  });

  test("allowlist set: returns 403 for an authenticated non-member and does no work", async () => {
    getServerSession.mockResolvedValue(nonAdminSession());
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: { message: "Forbidden" } });
    expect(entry.work()).not.toHaveBeenCalled();
  });

  test("allowlist set: returns 403 for a session without a stable subject, even with an admin's email", async () => {
    getServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    const res = await call();
    expect(res.status).toBe(403);
    expect(entry.work()).not.toHaveBeenCalled();
  });

  describe.each([["unset", undefined], ["empty", ""], ["separators only", " , ,"]])("allowlist %s", (_case, value) => {
    beforeEach(() => setAllowlist(value));

    test("returns 401 when unauthenticated and does no work", async () => {
      getServerSession.mockResolvedValue(null);
      const res = await call();
      expect(res.status).toBe(401);
      expect(entry.work()).not.toHaveBeenCalled();
    });

    test.each([
      ["any authenticated user", nonAdminSession],
      ["a session without a subject", () => ({ user: { email: "visitor@test.com" } })],
    ])("allows %s, logging one redacted info line", async (_who, session) => {
      getServerSession.mockResolvedValue(session());
      const res = await call();
      expect(res.status).toBe(entry.okStatus ?? 200);
      expect(entry.work()).toHaveBeenCalled();
      const logged = console.info.mock.calls.flat().map(String).join(" | ");
      expect(logged).toContain("ADMIN_AUTH0_SUBS is not set");
      expect(logged).not.toContain("auth0|someone-else");
      expect(logged).not.toContain("visitor@test.com");
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
