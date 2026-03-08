# Architecture and Core Functionality

Related docs:
- Project setup and commands: [README.md](../README.md)
- Contribution/agent guardrails: [AGENTS.md](../AGENTS.md)
- Historical pitfalls and rationale: [docs/LESSONS_LEARNED.md](LESSONS_LEARNED.md)

## 1) Runtime and framework
- The app runs on the **App Router**.
- Runtime baseline is **Node 20.19+**.
- The root route (`/`) is served from `app/page.js`.
- Feature pages are implemented under `app/` route segments.
- API endpoints are implemented as Route Handlers under `app/api/`.

## 2) High-level layers

### Presentation layer
- UI is composed from reusable React components in `components/`.
- Root page composition is in `app/page.js` (server) + `components/pages/HomePageClient.js` (client).
- Additional feature pages are implemented in App Router segments (for example `app/forecastinfo/page.js`, `app/trentweirs/page.js`, and admin pages under `app/admin/`).
- Bootstrap + React-Bootstrap are used for layout and widgets.

### Client data access
- SWR is used for client-side polling/caching via `libs/useFetch.js` + `libs/fetcher.js`.
- Graph thresholds are shared through context in `libs/context/graphcontrol.js`.

### Data freshness policy (balanced)
- The app uses a **domain-driven freshness strategy**:
   - editorial/infrequently changing content: static/ISR
   - operational measurements and forecasts: client-side SWR

| Domain | Primary source | Primitive | Refresh window | Rationale |
|---|---|---|---:|---|
| Events | `eventschemas` | App Router `unstable_cache` + tags for home snapshot, SWR for interactive lists | Cache: **6h** + write-triggered `revalidateTag`; SWR: on demand/focus | Events usually change infrequently; cached home snapshot reduces DB load and admin writes invalidate snapshot tags immediately. |
| Site banner | `sitebannerschemas` | App Router `unstable_cache` + tags for home header, SWR in admin editor | Cache: **6h** + write-triggered `revalidateTag`; SWR: on demand/focus | Banner is editorial and low-frequency, with immediate tag invalidation after admin writes. |
| HPP status | `openIndicator` | Route Handler `revalidate` (15m) + SWR client fetch (`/api/hppstatus`) | **15m** (`900000ms`) | Status is operational and should stay reasonably fresh without aggressive polling while reducing repeated backend computation. |
| River levels | `riverschemas` | Route Handler `revalidate` (15m) + SWR client fetch (`/api/levels`) | **15m** (`900000ms`) | Upstream level data typically updates on a 15-minute cadence; server-side revalidation smooths request bursts. |
| Forecast data | S3 forecast + derived APIs | Route Handler `revalidate` (15m) + SWR client fetch (`/api/s3forecast`, `/api/forecastaccuracy`) | **15m** (`900000ms`) | Forecast and related quality indicators are operational and align to the same source update interval. |
| Trent gauge dashboard | Environment Agency flood-monitoring API | Route Handler `revalidate` (15m) + SWR client fetch (`/api/trentweirs`) | **15m** (`900000ms`) | Trent gauge pages use an app-owned cache boundary so browser traffic no longer fans out directly to Environment Agency station endpoints. |

For forecast handlers that call S3, `fetch()` is configured with explicit `next.revalidate = 900` to align upstream request caching with route-level revalidation.
The shared helper `libs/api/fetchWithRevalidate.js` keeps this upstream fetch policy consistent across forecast endpoints.

### API/application layer
- Public and protected server handlers are Route Handlers in `app/api/*`.
- Shared error primitives/mapping are centralized in `libs/api/http.js`.
- App Router helpers are centralized in `libs/api/httpApp.js`.
- Current standard route pattern is:
   - export per-method handlers (`GET`, `POST`, `DELETE`, etc.)
   - keep one route-level `try/catch` boundary
   - map errors with shared `mapApiError()`
- Examples:
  - `app/api/events/route.js`: read/update/delete events.
  - `app/api/sitebanner/route.js`: get/update banner messages.
  - `app/api/hppstatus/route.js`: computes closure days over time windows.
   - `app/api/levels/route.js`: reads the latest river snapshot via `libs/services/levelsService.js`.
   - `app/api/trentweirs/route.js`: serves the cached Trent gauge snapshot via `libs/services/trentWeirsService.js`.
   - `app/api/waterquality/route.js`: reads water-quality snapshots via `libs/services/waterQualityService.js`.
   - `app/api/trentlockapi/route.js`: persists Trent Lock submissions via `libs/services/trentLockService.js`.

### Service layer
- Domain logic has begun moving into service modules:
  - `libs/services/eventsService.js`
   - `libs/services/hppStatusService.js`
   - `libs/services/levelsService.js`
  - `libs/services/siteBannerService.js`
   - `libs/services/trentWeirsService.js`
   - `libs/services/trentLockService.js`
   - `libs/services/waterQualityService.js`
- These services encapsulate validation + persistence calls used by API handlers.

### Data layer
- MongoDB connectivity is centralized in `libs/database.js`.
- It uses a global cached promise/connection pattern to avoid reconnecting on every request.
- Failed connection attempts are cleared from the cache so later requests can retry after transient Mongo outages.

### AuthN/AuthZ
- NextAuth is configured in `app/api/auth/[...nextauth]/route.js` using shared options from `libs/auth/authOptions.js`.
- Protected mutations (e.g., POST/DELETE in events, POST in site banner) rely on server session checks via shared `requireRouteSession()`.
- App Router route handlers use `requireRouteSession()` from `libs/api/httpApp.js`.
- Unauthenticated protected writes return `401` with `{ message: "Unauthorized" }`.
- Use `403` only for authenticated users lacking required permissions/roles (if/when role-based authorization is introduced).

## 2.1) API route conventions
- Prefer `message` as the standard error response key.
- For method mismatches, set `Allow` and return `405`.
- Prefer domain-level throws (`HttpError`, Yup validation errors) and route-level mapping in `mapApiError()`.
- Keep route handlers focused on orchestration; place domain validation/persistence in services where available.
- Prefer shared request logging helpers (`libs/api/logger.js`) for consistent timestamp + context formatting.

### HTTP status semantics
- `400`: request shape/validation errors (invalid body, invalid id format, schema validation).
- `401`: unauthenticated requests to protected endpoints.
- `403`: authenticated but not authorized for the action.
- `404`: resource not found (for example delete/update target does not exist).
- `500`: unexpected/unhandled server-side failures.

### Response contract (current standard)
- Success responses should use: `{ ok: true, data: ... }`
- Error responses should use: `{ ok: false, error: { message: string } }`
- `405` should return JSON in the same error shape and include `Allow`.
- Frontend fetch helpers should unwrap `{ ok: true, data }` to keep consumer code simple.
- For empty-state reads (e.g. `hppstatus` with no records), prefer `200` with explicit empty payload metadata over `500`.
- For homepage-critical operational reads (currently `hppstatus` and `levels`), prefer `200` with intentional fallback payloads during transient Mongo outages so the SPA can degrade gracefully instead of crashing.

## 3) Important functionality

1. **Open/closed status insights**
   - `app/api/hppstatus/route.js` processes historical status records and returns:
     - current status
     - effective last open date
     - closure-day counts for 7/28/182/365 day windows

2. **Event management**
   - Public users can fetch upcoming events.
   - Authenticated admins can upsert and delete events.
   - Validation is performed with Yup in the service layer.

3. **Site banner management**
   - Public endpoint exposes current banner entries.
   - Authenticated admin updates banner title, content, visibility, and scheduling.
   - Homepage rendering respects the saved `banner_enabled` flag while preserving draft message/title content in storage.
   - Banner scheduling supports optional start/end dates, enabling both immediate banners and open-ended banners that remain visible until explicitly hidden.

4. **Forecasting and analysis views**
   - Forecast pages compare data sources and surface quality metrics.

5. **Water quality and CSO data**
   - Water-quality endpoints under `app/api/waterquality/*` expose:
     - latest water quality snapshot
     - CSO density time series
     - bulk CSO detail lookup
     - single CSO detail lookup
   - Querying and payload shaping for these endpoints live in `libs/services/waterQualityService.js`.

6. **Trent Lock submissions**
   - `app/api/trentlockapi/route.js` accepts user submissions and enriches them with Environment Agency station readings when available.
   - Submission orchestration and persistence live in `libs/services/trentLockService.js`.

7. **Trent gauge dashboard cache**
   - `app/api/trentweirs/route.js` is the app-owned cache boundary for Trent gauge pages.
   - `libs/services/trentWeirsService.js` fetches Environment Agency readings server-side per required measure type so mixed stations do not lose `level` history to `flow` rows.
   - `app/trentweirs/page.js` is now the overview-first Trent dashboard, combining summary cards and a comparison workspace on one page.
   - `components/functional/trentDashboard.js` centralizes the shared Trent dashboard controls so gauge selection, time window, and comparison mode are coordinated instead of repeated per card.
   - `app/trentcharts/page.js` now redirects to `app/trentweirs/page.js`, preserving the old route while keeping one primary Trent dashboard experience.

10. **Colwick alerting MVP**
   - Public alert signup lives under `app/api/alerts/route.js` and is limited to the Colwick gauge for the first iteration.
   - Confirmation and unsubscribe flows live under `app/api/alerts/confirm/route.js` and `app/api/alerts/unsubscribe/route.js`.
   - Email-based alert management access lives under `app/api/alerts/manage-link/route.js`, `app/api/alerts/manage/route.js`, and the user-facing `app/alerts/page.js`.
   - Alert persistence and threshold-evaluation logic live in `libs/services/colwickAlertsService.js`.
   - The S3 forecast fetch/parse logic is shared via `libs/services/forecastService.js`, so both the public forecast API and internal alert evaluation use the same source of truth.
   - Scheduled evaluation runs via `app/api/internal/alerts/run/route.js` and is intended to be triggered by Vercel Cron every 15 minutes.
   - Alert emails are transactional and use a Resend-compatible HTTP integration. Required env vars are `SITE_URL`, `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, and `CRON_SECRET`.
   - Management links are email-scoped, time-limited tokens stored separately from alert subscriptions so users can view and remove their alerts without a full account system.

8. **Admin editing experience**
   - Admin pages now use a more consistent editing pattern across events and site banner workflows.
   - Event management uses a focused list-and-editor flow with consistent save/reset/delete feedback.
   - Banner management includes preview, visibility toggle, scheduling controls, and clearer loading/success/error states.

9. **Home page static data strategy**
   - `app/page.js` uses App Router `unstable_cache` (`revalidate = 21600`) with tags (`home-snapshot`, `events`, `site-banner`) to cache events/banner and reduce load.
    - Data assembly for the home snapshot lives in `libs/services/homePageService.js`.
   - Home snapshot assembly tolerates partial Mongo-backed failures so banner and events can fall back independently.
   - Admin writes in `app/api/events/route.js` and `app/api/sitebanner/route.js` trigger `revalidateTag` for immediate snapshot refresh.
   - Operational data (levels/status/forecast/water quality) uses Route Handler `revalidate` at **15 minutes** and remains client-side via SWR at the same cadence.

## 6) App Router status
- Completed:
   - Root route and feature pages use App Router (`app/page.js` + route segments).
   - NextAuth route uses App Router (`app/api/auth/[...nextauth]/route.js`).
   - API endpoints are implemented as Route Handlers under `app/api/*`.
- Remaining enhancements:
   - Extend tag-based invalidation to any new editorial snapshot domains beyond events/site banner.
   - Continue extracting reusable domain logic into `libs/services/*` as endpoints evolve.

## 4) Testing strategy
- Jest powers both API route tests and component/unit tests under `__tests__/`.
- Mocks for DB/auth/live dependencies live in `__mocks__/`.
- Recommended baseline check before merge:
  - `npm test`
  - `npm run lint`

## 5) Known architectural characteristics
- Most domain-heavy Route Handlers now delegate to `libs/services`; remaining inline logic should follow the same pattern as endpoints evolve.
- Some endpoints still accept legacy body shapes; `parseRequestBody()` exists to smooth migration.
- Continued value: move remaining domain logic from handlers to `libs/services` while preserving the shared route contract.
