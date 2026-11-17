/** @jest-environment node */
jest.mock("next-auth/providers/auth0", () => jest.fn((options) => ({ id: "auth0", ...options })));

const {
  ADMIN_ACCESS,
  getAdminAccess,
  getAdminAllowlist,
  isAdminSubject,
  resetAdminAccessDiagnosticsForTests,
} = require("../libs/auth/adminAccess");
const { authOptions } = require("../libs/auth/authOptions");
const { TEST_ADMIN_SUB } = require("../testUtils/adminSessions");

describe("admin allowlist", () => {
  beforeEach(() => {
    resetAdminAccessDiagnosticsForTests();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test("parses comma- and whitespace-separated subjects", () => {
    const env = { ADMIN_AUTH0_SUBS: " auth0|a ,google-oauth2|b\nauth0|c,, " };
    expect([...getAdminAllowlist(env)]).toEqual(["auth0|a", "google-oauth2|b", "auth0|c"]);
  });

  test("grants only exact subject matches", () => {
    const env = { ADMIN_AUTH0_SUBS: "auth0|a" };
    expect(getAdminAccess("auth0|a", env)).toBe(ADMIN_ACCESS.GRANTED);
    expect(getAdminAccess("auth0|A", env)).toBe(ADMIN_ACCESS.DENIED);
    expect(getAdminAccess("auth0|a ", env)).toBe(ADMIN_ACCESS.DENIED);
    expect(getAdminAccess("", env)).toBe(ADMIN_ACCESS.DENIED);
    expect(getAdminAccess(null, env)).toBe(ADMIN_ACCESS.DENIED);
    expect(getAdminAccess(undefined, env)).toBe(ADMIN_ACCESS.DENIED);
  });

  test("an email is never treated as an admin subject", () => {
    expect(isAdminSubject("admin@test.com", { ADMIN_AUTH0_SUBS: "auth0|a" })).toBe(false);
  });

  test("fails closed and logs one redacted diagnostic per process when unconfigured", () => {
    expect(getAdminAccess("auth0|a", {})).toBe(ADMIN_ACCESS.UNCONFIGURED);
    expect(getAdminAccess("auth0|a", { ADMIN_AUTH0_SUBS: "" })).toBe(ADMIN_ACCESS.UNCONFIGURED);
    expect(isAdminSubject("auth0|a", {})).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error.mock.calls[0][0]).toBe("[auth] ADMIN_AUTH0_SUBS is not configured; admin access is denied for every user.");
  });
});

describe("NextAuth session callback", () => {
  const callback = authOptions.callbacks.session;
  const session = { user: { name: "Someone", email: "someone@test.com" }, expires: "2026-12-01T00:00:00.000Z" };

  test("exposes the stable subject and marks allowlisted admins", () => {
    const result = callback({ session, token: { sub: TEST_ADMIN_SUB } });
    expect(result.user).toEqual({
      name: "Someone",
      email: "someone@test.com",
      id: TEST_ADMIN_SUB,
      isAdmin: true,
      adminAccess: "granted",
    });
    expect(result.expires).toBe(session.expires);
  });

  test("marks other subjects and missing subjects as non-admin", () => {
    expect(callback({ session, token: { sub: "auth0|other" } }).user).toMatchObject({ isAdmin: false, adminAccess: "denied" });
    expect(callback({ session, token: {} }).user).toMatchObject({ id: null, isAdmin: false });
  });

  test("never adds token material to the session", () => {
    const result = callback({ session, token: { sub: TEST_ADMIN_SUB, accessToken: "secret", idToken: "secret" } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
