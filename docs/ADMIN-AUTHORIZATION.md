# Admin authorization

Part of [Wave A product quality](../openspec/changes/wave-a-product-quality/tasks.md) ("Admin routes enforce
intentional authorization for authenticated non-admin users").

## Policy

Every admin page and privileged API goes through one policy (`libs/auth/adminAccess.js`):

- **`ADMIN_AUTH0_SUBS` unset or empty (default):** any authenticated Auth0 session is an admin. Admin trust then
  rests on the Auth0 tenant: sign-up and social connections must stay closed, and the tenant/application must not be
  shared with other apps whose users could sign in here. The server logs one redacted info line per process:
  `[auth] ADMIN_AUTH0_SUBS is not set; any authenticated user is an admin, relying on the Auth0 tenant restricting sign-up.`
- **`ADMIN_AUTH0_SUBS` set (optional hardening):** only the listed Auth0 subjects (`sub`) are admins. Emails, names
  and sign-up state never grant access.

| Caller | Admin API response | `/admin/*` page |
| --- | --- | --- |
| Not signed in | `401 { message: "Unauthorized" }` | "Admin sign-in required" |
| Signed in, allowlist unset | normal response | admin UI |
| Signed in, allowlist set, `sub` listed | normal response | admin UI |
| Signed in, allowlist set, `sub` not listed (or no `sub`) | `403 { message: "Forbidden" }` | "Not authorised" (shows the user's own account ID) |

Subjects, emails, tokens and session contents are never logged; admin write audit lines record only the actor's `sub`.

## Where it is enforced

- `libs/auth/adminAccess.js`: parses the allowlist and resolves `granted | denied` for an authenticated subject.
- `libs/auth/authOptions.js` session callback: adds `user.id` (the `sub`) and `user.isAdmin`, re-evaluated with the
  same policy on every session read. No token material is added.
- `requireRouteAdmin()` in `libs/api/httpApp.js`: server-side check for every privileged handler, independent of the
  client flag.
- `app/admin/layout.js`: server-side gate for every page under `/admin`; `AdminBody`, the admin nav and the
  operational overview widget repeat the check client-side.

Privileged handlers (all use `requireRouteAdmin()`):

- `GET`/`POST /api/admin/events`, `PUT`/`DELETE /api/admin/events/{id}` (authorized before the request is parsed;
  replaces the former `POST`/`DELETE /api/events`, which is now a public read-only feed)
- `POST /api/sitebanner`
- `GET /api/admin/operational-health`, `GET /api/admin/operational-overview`, `GET /api/admin/cso-shadow`,
  `GET /api/admin/hpp-shadow`

Deliberately **not** admin-only: public `GET` data endpoints; alert signup/confirm/manage/unsubscribe (subscriber
tokens); `POST /api/alerts/manage-link`; `POST /api/trentlockapi` (public lookup); NextAuth's own endpoints; cron
routes under `/api/internal/*` (`CRON_SECRET`). `__tests__/api/admin-authorization.test.js` scans `app/api` and fails
if a new mutating handler, or any handler under `app/api/admin`, is not classified as admin-only or explicitly exempt.

## Optional configuration

Deploying this code needs no configuration: with the variable unset, behaviour matches the previous "any signed-in
user is admin" rule. To harden, set `ADMIN_AUTH0_SUBS` to comma- or whitespace-separated Auth0 subjects, matched
exactly (case-sensitive), for example

```
ADMIN_AUTH0_SUBS=auth0|64f0c0ffee0000000000abcd,google-oauth2|101234567890123456789
```

Find a subject in the Auth0 dashboard (User Management → Users → the user → `user_id`). A person who signs in through
two Auth0 connections has two subjects; list each one they use. It is a server-only variable (no `NEXT_PUBLIC_`
prefix); Vercel applies env changes on the next deployment, after which sessions pick up the new value on their next
read.

Suggested order when enabling it: set it for **Preview** first and check that an admin can still save and that a
different signed-in account sees "Not authorised" / `403`; then set it for **Production** and redeploy. To undo, unset
it and redeploy.

Local development: leave it unset, or add your own `sub` in `.env.local`. Tests set a fixed test subject in
`jest.setup.js` (`testUtils/adminSessions.js`) and also cover the unset policy.

## Changing identity provider

A future move from Auth0 (for example to Clerk) replaces only the policy/session seam: `libs/auth/adminAccess.js`,
the session callback in `libs/auth/authOptions.js` and the session lookup inside `requireRouteSession()` /
`requireRouteAdmin()` and `app/admin/layout.js`. Route handlers keep calling `requireRouteAdmin()`, and the route
classification test still applies.
