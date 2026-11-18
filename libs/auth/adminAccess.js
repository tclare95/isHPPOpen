/**
 * Admin authorization policy. This module (with the NextAuth session callback and requireRouteAdmin())
 * is the single seam to replace if the identity provider changes.
 *
 * - ADMIN_AUTH0_SUBS unset/empty: every authenticated session is an admin. Admin trust then depends on
 *   the Auth0 tenant keeping sign-up and social connections closed and not being shared with other apps.
 * - ADMIN_AUTH0_SUBS set (comma- or whitespace-separated Auth0 `sub` values, e.g. `auth0|abc123`): only
 *   those exact subjects are admins (optional hardening).
 *
 * Callers must establish that a session exists first. Identities, emails and tokens are never logged.
 */

export const ADMIN_ALLOWLIST_ENV = "ADMIN_AUTH0_SUBS";

export const ADMIN_ACCESS = Object.freeze({
  GRANTED: "granted",
  DENIED: "denied",
});

let reportedOpenPolicy = false;

export function getAdminAllowlist(env = process.env) {
  const raw = env[ADMIN_ALLOWLIST_ENV];
  if (typeof raw !== "string") return new Set();
  return new Set(raw.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean));
}

/** Resolves admin access for the Auth0 subject of an authenticated session. */
export function getAdminAccess(subject, env = process.env) {
  const allowlist = getAdminAllowlist(env);

  if (allowlist.size === 0) {
    if (!reportedOpenPolicy) {
      reportedOpenPolicy = true;
      console.info(`[auth] ${ADMIN_ALLOWLIST_ENV} is not set; any authenticated user is an admin, relying on the Auth0 tenant restricting sign-up.`);
    }
    return ADMIN_ACCESS.GRANTED;
  }

  return typeof subject === "string" && subject.length > 0 && allowlist.has(subject)
    ? ADMIN_ACCESS.GRANTED
    : ADMIN_ACCESS.DENIED;
}

export function isAdminSubject(subject, env = process.env) {
  return getAdminAccess(subject, env) === ADMIN_ACCESS.GRANTED;
}

/** Test-only: allows the one-time policy log line to be asserted again. */
export function resetAdminAccessDiagnosticsForTests() {
  reportedOpenPolicy = false;
}
