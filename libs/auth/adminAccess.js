/**
 * Admin authorization: an authenticated Auth0 identity is an administrator only when its stable
 * Auth0 subject (`sub`, shown as "user_id" in the Auth0 dashboard, e.g. `auth0|abc123`) is listed
 * in ADMIN_AUTH0_SUBS (comma- or whitespace-separated). Authentication alone grants nothing.
 *
 * Fails closed: an unset or empty allowlist denies every user and logs one redacted configuration
 * error per process. Identities, emails and tokens are never logged.
 */

export const ADMIN_ALLOWLIST_ENV = "ADMIN_AUTH0_SUBS";

export const ADMIN_ACCESS = Object.freeze({
  GRANTED: "granted",
  DENIED: "denied",
  UNCONFIGURED: "unconfigured",
});

let reportedUnconfigured = false;

export function getAdminAllowlist(env = process.env) {
  const raw = env[ADMIN_ALLOWLIST_ENV];
  if (typeof raw !== "string") return new Set();
  return new Set(raw.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean));
}

/** Resolves the admin access state for an Auth0 subject against the current allowlist. */
export function getAdminAccess(subject, env = process.env) {
  const allowlist = getAdminAllowlist(env);

  if (allowlist.size === 0) {
    if (!reportedUnconfigured) {
      reportedUnconfigured = true;
      console.error(`[auth] ${ADMIN_ALLOWLIST_ENV} is not configured; admin access is denied for every user.`);
    }
    return ADMIN_ACCESS.UNCONFIGURED;
  }

  return typeof subject === "string" && subject.length > 0 && allowlist.has(subject)
    ? ADMIN_ACCESS.GRANTED
    : ADMIN_ACCESS.DENIED;
}

export function isAdminSubject(subject, env = process.env) {
  return getAdminAccess(subject, env) === ADMIN_ACCESS.GRANTED;
}

/** Test-only: allows the one-time configuration error to be asserted again. */
export function resetAdminAccessDiagnosticsForTests() {
  reportedUnconfigured = false;
}
