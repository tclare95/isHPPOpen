jest.mock("next-auth/react", () => ({ useSession: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }));
jest.mock("next-auth/providers/auth0", () => jest.fn((options) => ({ id: "auth0", ...options })));
jest.mock("../libs/useFetch", () => jest.fn(() => ({ data: undefined, error: undefined, isPending: true })));

const { render, screen } = require("@testing-library/react");
const { getServerSession } = require("next-auth");
const { useSession } = require("next-auth/react");
const useFetch = require("../libs/useFetch");
const AdminLayout = require("../app/admin/layout").default;
const AdminBody = require("../components/layout/adminpage/adminbody").default;
const OperationalHealthSummary = require("../components/functional/operationalHealthSummary").default;
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

  test("operational health is only requested for admins", () => {
    useSession.mockReturnValue({ data: clientSession(nonAdminSession(), "denied"), status: "authenticated" });
    const { container } = render(<OperationalHealthSummary />);
    expect(container).toBeEmptyDOMElement();
    expect(useFetch).toHaveBeenLastCalledWith(null);

    useSession.mockReturnValue({ data: clientSession(adminSession(), "granted"), status: "authenticated" });
    render(<OperationalHealthSummary />);
    expect(useFetch).toHaveBeenLastCalledWith("/api/admin/operational-health");
  });

  test("the test admin subject is allowlisted by jest setup", () => {
    expect(process.env.ADMIN_AUTH0_SUBS).toBe(TEST_ADMIN_SUB);
  });
});
