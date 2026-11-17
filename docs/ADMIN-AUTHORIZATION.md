# Admin authorization

Part of [Wave A product quality](../openspec/changes/wave-a-product-quality/tasks.md) ("Admin routes enforce
intentional authorization for authenticated non-admin users").

## Rule

Signing in with Auth0 proves identity only. An identity is an **administrator** only when its stable Auth0
subject (`sub`) is listed in `ADMIN_AUTH0_SUBS`. Email addresses, names and Auth0 sign-up state never grant access.

| Caller | Admin API response | `/admin/*` page |
| --- | --- | --- |
| Not signed in | `401 { message: "Unauthorized" }` | "Admin sign-in required" |
| Signed in, `sub` not allowlisted | `403 { message: "Forbidden" }` | "Not authorised" (shows the user's own account ID) |
| `ADMIN_AUTH0_SUBS` unset/empty (fails closed) | `403 { message: "Admin access is not configured" }` | "Admin access is not configured" |
| Signed in, `sub` allowlisted | normal response | admin UI |

When the allowlist is unset or empty the server logs one redacted line per process:
`[auth] ADMIN_AUTH0_SUBS is not configured; admin access is denied for every user.` Subjects, emails, tokens and
session contents are never logged; admin write audit lines record only the actor's `sub`.

### Before this change

`requireRouteSession()` only checked that a NextAuth session existed, and `AdminBody` rendered the admin UI for any
session. Any identity that could complete the Auth0 login for this application (for example via Auth0 sign-up or a
social connection, depending on tenant settings) could create/delete events, change the site banner and read the
admin diagnostics.

## Where it is enforced

- `libs/auth/adminAccess.js`: parses the allowlist and resolves `granted | denied | unconfigured`.
- `libs/auth/authOptions.js` session callback: adds `user.id` (the `sub`), `user.isAdmin` and `user.adminAccess`,
  re-evaluated against the current allowlist on every session read. No token material is added.
- `requireRouteAdmin()` in `libs/api/httpApp.js`: server-side check for every privileged handler, independent of the
  client flag.
- `app/admin/layout.js`: server-side gate for every page under `/admin`; `AdminBody` repeats the check client-side.

Privileged handlers (all use `requireRouteAdmin()`):

- `POST /api/events`, `DELETE /api/events`
- `POST /api/sitebanner`
- `GET /api/admin/operational-health`, `GET /api/admin/cso-shadow`, `GET /api/admin/hpp-shadow`

Deliberately **not** admin-only: public `GET` data endpoints; alert signup/confirm/manage/unsubscribe (subscriber
tokens); `POST /api/alerts/manage-link`; `POST /api/trentlockapi` (public lookup); NextAuth's own endpoints; cron
routes under `/api/internal/*` (`CRON_SECRET`). `__tests__/api/admin-authorization.test.js` scans `app/api` and fails
if a new mutating handler, or any handler under `app/api/admin`, is not classified as admin-only or explicitly exempt.

## Configuration

`ADMIN_AUTH0_SUBS`: comma- or whitespace-separated Auth0 subjects, matched exactly (case-sensitive), for example

```
ADMIN_AUTH0_SUBS=auth0|64f0c0ffee0000000000abcd,google-oauth2|101234567890123456789
```

Find a subject in the Auth0 dashboard (User Management → Users → the user → `user_id`), or sign in to `/admin` on a
deployment of this branch: the "Not authorised" / "not configured" notice shows the signed-in user's own account ID.
A person who signs in through two Auth0 connections has two subjects; list each one they should use.

It is a server-only variable (no `NEXT_PUBLIC_` prefix). Changing it requires a redeploy in Vercel; once deployed,
existing sessions pick up the new value on their next session read.

## Rollout order

1. Identify each current admin's Auth0 `sub` (dashboard, or the notice on a preview deployment of this branch).
2. In Vercel, set `ADMIN_AUTH0_SUBS` for **Preview** and verify on the PR preview: an admin sees the admin UI and can
   save; a different signed-in account sees "Not authorised" and gets `403` from the admin APIs.
3. Set `ADMIN_AUTH0_SUBS` for **Production** *before* merging (merging main deploys automatically).
4. Merge. After the production deploy, confirm an admin can open `/admin` and save, and that the runtime logs do not
   contain the "is not configured" line.

Rollback: if an admin is locked out, add their `sub` and redeploy (do not revert the check). Reverting the code
restores "any signed-in Auth0 user is admin" and should be a last resort.

Local development: add your own `sub` to `ADMIN_AUTH0_SUBS` in `.env.local`. Tests use the fixed test subject set in
`jest.setup.js` (`testUtils/adminSessions.js`).
