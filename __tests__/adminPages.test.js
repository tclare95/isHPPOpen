jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }));
jest.mock("next-auth/providers/auth0", () => jest.fn((options) => ({ id: "auth0", ...options })));
jest.mock("../libs/useFetch", () => jest.fn(() => ({ data: undefined, error: undefined, isPending: true })));

const { render, screen, within } = require("@testing-library/react");
const { getServerSession } = require("next-auth");
const { useSession } = require("next-auth/react");
const useFetch = require("../libs/useFetch");
const AdminLayout = require("../app/admin/layout").default;
const AdminBody = require("../components/layout/adminpage/adminbody").default;
const OperationalOverview = require("../components/functional/operationalOverview").default;
const { resetAdminAccessDiagnosticsForTests } = require("../libs/auth/adminAccess");
const { TEST_ADMIN_SUB, adminSession, nonAdminSession } = require("../testUtils/adminSessions");

// Mirrors what the NextAuth session callback adds for the client.
const clientSession = (session, adminAccess) => ({
  ...session,
  user: { ...session.user, isAdmin: adminAccess === "granted" },
});

const SECRET_UI = "admin editor UI";

describe("admin layout (server gate)", () => {
  const originalAllowlist = process.env.ADMIN_AUTH0_SUBS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "info").mockImplementation(() => {});
    resetAdminAccessDiagnosticsForTests();
    process.env.ADMIN_AUTH0_SUBS = originalAllowlist;
    useSession.mockReturnValue({ data: null, status: "unauthenticated" });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.ADMIN_AUTH0_SUBS = originalAllowlist;
  });

  const renderLayout = async () => render(await AdminLayout({ children: <div>{SECRET_UI}</div> }));

  test("asks signed-out visitors to sign in", async () => {
    getServerSession.mockResolvedValue(null);
    await renderLayout();
    expect(screen.getByRole("heading", { name: "Admin sign-in required" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET_UI)).not.toBeInTheDocument();
  });

  test("shows a not-authorised state to signed-in non-admins", async () => {
    getServerSession.mockResolvedValue(nonAdminSession());
    useSession.mockReturnValue({ data: clientSession(nonAdminSession(), "denied"), status: "authenticated" });
    await renderLayout();
    expect(screen.getByRole("heading", { name: "Not authorised" })).toBeInTheDocument();
    expect(screen.getByText("auth0|someone-else")).toBeInTheDocument();
    expect(screen.queryByText(SECRET_UI)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Events" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0);
  });

  test("without an allowlist, any signed-in user sees admin pages", async () => {
    delete process.env.ADMIN_AUTH0_SUBS;
    getServerSession.mockResolvedValue(nonAdminSession());
    await renderLayout();
    expect(screen.getByText(SECRET_UI)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("without an allowlist, signed-out visitors are still asked to sign in", async () => {
    delete process.env.ADMIN_AUTH0_SUBS;
    getServerSession.mockResolvedValue(null);
    await renderLayout();
    expect(screen.getByRole("heading", { name: "Admin sign-in required" })).toBeInTheDocument();
    expect(screen.queryByText(SECRET_UI)).not.toBeInTheDocument();
  });

  test("renders admin pages for allowlisted admins", async () => {
    getServerSession.mockResolvedValue(adminSession());
    await renderLayout();
    expect(screen.getByText(SECRET_UI)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AdminBody (client defence in depth)", () => {
  beforeEach(() => jest.clearAllMocks());

  const renderBody = () => render(<AdminBody><div>{SECRET_UI}</div></AdminBody>);

  test.each([
    ["signed out", { data: null, status: "unauthenticated" }, "Admin sign-in required"],
    ["non-admin", { data: clientSession(nonAdminSession(), "denied"), status: "authenticated" }, "Not authorised"],
  ])("hides admin UI when %s", (_case, sessionState, heading) => {
    useSession.mockReturnValue(sessionState);
    renderBody();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.queryByText(SECRET_UI)).not.toBeInTheDocument();
  });

  test("renders admin UI for an admin session", () => {
    useSession.mockReturnValue({ data: clientSession(adminSession(), "granted"), status: "authenticated" });
    renderBody();
    expect(screen.getByText(SECRET_UI)).toBeInTheDocument();
  });

  test("operational diagnostics are only requested for admins", () => {
    useSession.mockReturnValue({ data: clientSession(nonAdminSession(), "denied"), status: "authenticated" });
    const { container } = render(<OperationalOverview />);
    expect(container).toBeEmptyDOMElement();
    expect(useFetch.mock.calls.map(([path]) => path)).toEqual([null, null]);

    useFetch.mockClear();
    useSession.mockReturnValue({ data: clientSession(adminSession(), "granted"), status: "authenticated" });
    render(<OperationalOverview />);
    expect(useFetch.mock.calls.map(([path]) => path)).toEqual(["/api/admin/operational-health", "/api/admin/operational-overview"]);
  });

  test("the test admin subject is allowlisted by jest setup", () => {
    expect(process.env.ADMIN_AUTH0_SUBS).toBe(TEST_ADMIN_SUB);
  });
});

describe("OperationalOverview", () => {
  const NOW = Date.now();
  const at = (minutes) => new Date(NOW - minutes * 60000).toISOString();
  const health = { checkedAt: at(0), sources: [
    { name: "levels", latencyMs: 40, health: { source: "rdp", state: "fresh", generatedAt: at(5) } },
    { name: "forecast", latencyMs: 30, health: { source: "predictor", state: "stale", generatedAt: at(300) } },
  ] };
  const job = (key, label, state, extra = {}) => ({ key, label, state, attention: state !== "healthy", summary: `${label} summary`, evidenceAt: at(5), reasons: [], facts: [], links: [], ...extra });
  const overview = { checkedAt: at(0), components: [
    job("hppEvaluation", "HPP status evaluation", "unknown", { attention: false, summary: "Not checked: in-app evaluation is off" }),
    job("alertEvaluation", "Alert evaluation", "healthy", { facts: [{ label: "Active alerts evaluated", value: 7, kind: "count" }] }),
    job("alertDelivery", "Alert delivery", "degraded", {
      reasons: [{ category: "held_for_review", state: "degraded", message: "2 delivery(ies) are held for operator review." }],
      links: [{ label: "Reconciling a held alert delivery", href: "https://github.com/tclare95/isHPPOpen/blob/main/docs/ALERT_EVALUATION_RELIABILITY.md" }],
    }),
    job("waterQuality", "CSO and water quality", "unavailable", { reasons: [{ category: "x", state: "unavailable", message: "Water quality is down." }] }),
  ] };
  const respond = (byPath) => useFetch.mockImplementation((path) => byPath[path] ?? { data: undefined, error: undefined, isPending: false });

  beforeEach(() => {
    jest.clearAllMocks();
    useSession.mockReturnValue({ data: clientSession(adminSession(), "granted"), status: "authenticated" });
  });

  test("lists only non-healthy components that need attention, most severe first, with next steps", () => {
    respond({
      "/api/admin/operational-health": { data: health, isPending: false },
      "/api/admin/operational-overview": { data: overview, isPending: false },
    });
    render(<OperationalOverview />);
    const list = screen.getByRole("list", { name: "Components needing attention" });
    const items = within(list).getAllByRole("listitem").filter((item) => item.parentElement === list);
    expect(items.map((item) => item.querySelector("strong").textContent)).toEqual(["CSO and water quality", "Alert delivery", "Predictor forecast"]);
    expect(within(list).getByText("2 delivery(ies) are held for operator review.")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Reconciling a held alert delivery" })).toHaveAttribute("target", "_blank");
    expect(within(list).queryByText("Alert evaluation")).not.toBeInTheDocument();
    expect(within(list).queryByText("Observed river levels")).not.toBeInTheDocument();
    expect(screen.getByText(/Not checked because they are not enabled: HPP status evaluation/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alert evaluation" })).toBeInTheDocument();
    expect(screen.getByText("Active alerts evaluated")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Live source checks" })).toBeInTheDocument();
  });

  test("a failed overview load is listed as unknown, never as an all-clear", () => {
    respond({
      "/api/admin/operational-health": { data: { checkedAt: at(0), sources: [health.sources[0]] }, isPending: false },
      "/api/admin/operational-overview": { data: undefined, error: new Error("Forbidden"), isPending: false },
    });
    render(<OperationalOverview />);
    const list = screen.getByRole("list", { name: "Components needing attention" });
    expect(within(list).getByText("Scheduled job records")).toBeInTheDocument();
    expect(within(list).getByText("Unknown / not checked")).toBeInTheDocument();
    expect(screen.queryByText(/No component reports a problem/)).not.toBeInTheDocument();
  });

  test("with every component healthy it says so without merging them into one badge", () => {
    respond({
      "/api/admin/operational-health": { data: { checkedAt: at(0), sources: [health.sources[0]] }, isPending: false },
      "/api/admin/operational-overview": { data: { checkedAt: at(0), components: [overview.components[1]] }, isPending: false },
    });
    render(<OperationalOverview />);
    expect(screen.getByText(/No component reports a problem/)).toBeInTheDocument();
    expect(screen.getAllByText("Healthy")).toHaveLength(2);
  });

  test("never shows an all-clear while one request is still pending", () => {
    respond({
      "/api/admin/operational-health": { data: { checkedAt: at(0), sources: [health.sources[0]] }, isPending: false },
      "/api/admin/operational-overview": { data: undefined, isPending: true },
    });
    render(<OperationalOverview />);
    expect(screen.getByText(/Still checking/)).toBeInTheDocument();
    expect(screen.queryByText(/No component reports a problem/)).not.toBeInTheDocument();
  });
});
