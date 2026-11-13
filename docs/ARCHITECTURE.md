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
| River level history (#104) | RDP `GET /v1/measurements/ea-colwick-level/observations` (server-only signed client) | `unstable_cache` per UK calendar month + CDN `Cache-Control` on `/api/history/colwick/*`; SWR without polling | Completed months **24h**, current month **15m**; CDN 1h/15m, 60s when partial | Archived history changes only through provider revisions or imports; one bounded RDP read per month is reused by month, year, overview and high-water event views. See [HISTORICAL_RIVER_CONDITIONS.md](HISTORICAL_RIVER_CONDITIONS.md) and [HISTORICAL_RIVER_EVENTS.md](HISTORICAL_RIVER_EVENTS.md). |

For forecast handlers that call S3, `fetch()` is configured with explicit `next.revalidate = 900` to align upstream request caching with route-level revalidation.
The shared helper `libs/api/fetchWithRevalidate.js` keeps this upstream fetch policy consistent across forecast endpoints.

Editorial writes use the shared `libs/cache/revalidate.js` helper with `revalidateTag(tag, { expire: 0 })`: successful event and banner mutations expire both their domain tag and `home-snapshot`, so the first subsequent homepage read fetches fresh content. The six-hour cache remains reusable between writes. Individual invalidation failures are logged without turning a persisted write into an error, and remaining tags are still attempted.

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
   - `app/api/levels/route.js`: reads the latest river snapshot via `libs/services/levelsService.js`. `RDP_LEVELS_SOURCE` (`legacy|shadow|rdp`, default `legacy`) selects the observed `level_data` source only; `libs/rdp/levelsSource.js` is loaded only outside legacy. See [RDP-LEVELS-51C.md](RDP-LEVELS-51C.md).
   - `app/api/trentweirs/route.js`: serves the cached Trent gauge snapshot via `libs/services/trentWeirsService.js`.
   - `app/api/waterquality/route.js`: reads water-quality snapshots via `libs/services/waterQualityService.js`. `RDP_CSO_SOURCE` (`legacy|shadow|rdp`, default `legacy`) selects current CSO status for this route and `/api/waterquality/cso*` only; `libs/rdp/csoSource.js` is loaded only outside legacy, and alert evaluation keeps the legacy snapshot. Diagnostics: `/api/admin/cso-shadow`. See [RDP-CSO-120.md](RDP-CSO-120.md).
   - `app/api/waterquality/cso/events/route.js` (`?window=24h|7d|30d`) and `cso/events/[eventId]/route.js`: recorded CSO event history and per-event revisions from RDP via `libs/rdp/csoHistory.js`, behind `RDP_CSO_HISTORY=on` (default off). Descriptive only; never read by the indicator, density or alerts. See [RDP-CSO-HISTORY-121.md](RDP-CSO-HISTORY-121.md).
   - `app/api/waterquality/cso/catchment/route.js` (`?set=hpp-catchment`): whole-catchment CSO monitoring from RDP's collection-set activity via `libs/rdp/csoCatchment.js`, behind `RDP_CSO_CATCHMENT=on` (default off). Bounded cursor walk, complete walks cached; counts outfalls and distinct locations, unknown and coverage, plus a read-only comparison with legacy density/status history aligned by observation time. Never read by the indicator, density, thresholds or alerts. See [RDP-CSO-CATCHMENT-114.md](RDP-CSO-CATCHMENT-114.md).
   - `app/api/waterquality/river/route.js`: fixed-HPP River Tracer consumer via `libs/services/hppRiverService.js`, serving optional river/catchment layers and summaries in the existing water-quality map. Reuses the server-only RDP signed transport, stage isolation and a bounded 24-hour CDN cache; local fixtures are development-only. Public use was authorised after owner licensing confirmation on 6 November 2026. Water-quality calculations and CSO membership stay independent. See [HPP-RIVER-TRACER.md](HPP-RIVER-TRACER.md).
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

- The `libs/rdp/` foundation provides server-only Vercel OIDC → STS →
  SigV4 reads of the internal RDP API, strict Preview/staging versus
  Production/production configuration, and six explicit gauge aliases.
  [Slice #51-A](RDP-CLIENT-51A.md) documents the contract and separately approved
  Preview smoke. [Slice #51-B](RDP-TRENT-51B.md) lets `/api/trentweirs` read it
  when `RDP_TRENT_SOURCE` is `shadow` or `rdp` (default and all deployed targets:
  `legacy`). [Slice #51-C](RDP-LEVELS-51C.md) does the same for observed
  Colwick `level_data` in `/api/levels` via `RDP_LEVELS_SOURCE`; `forecast_data`
  stays on the scraper snapshot. [Slice #51-D](RDP-GAUGE-ALERTS-51D.md) gives
  live gauge alerts their own alert-safe EA/RDP reader via `RDP_GAUGE_ALERTS_SOURCE`
  (default and all deployed targets: `legacy`).
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
   - `app/api/hppstatus/route.js` delegates to `libs/services/hppStatusService.js`, which processes `openIndicator` transitions and returns:
     - current status
     - effective last open date
     - closure-day counts for 7/28/182/365 day windows
   - The service reads only the 365-day window plus the single latest valid transition before it, so every window starts from the status carried into it ([#63](https://github.com/tclare95/isHPPOpen/issues/63)). Records without a valid timestamp and boolean `value` are ignored.
   - The window calculation itself is pure (`libs/hpp/hppWindows.js`) and shared with the in-app HPP status service ([#89](https://github.com/tclare95/isHPPOpen/issues/89), `libs/hpp/hppShadowService.js`). That service is shadow-only: it writes `hppShadowState`/`hppShadowTransitions`, never `openIndicator`, and no route or cron calls it yet. The legacy scraper remains the sole `openIndicator` writer. See [HPP-STATUS-SERVICE.md](HPP-STATUS-SERVICE.md).

2. **Event management**
   - Public users can fetch upcoming events.
   - Authenticated admins can upsert and delete events.
   - Validation is performed with Yup in the service layer.

3. **Site banner management**
   - Public endpoint exposes current banner entries.
   - Authenticated admin updates banner title, content, visibility, and scheduling.
   - Homepage rendering respects the saved `banner_enabled` flag while preserving draft message/title content in storage.
   - Banner scheduling supports optional start/end dates, enabling both immediate banners and open-ended banners that remain visible until explicitly hidden.
   - Scheduled banners resolve visibility after hydration, then update at inclusive start/end boundaries and when the browser regains focus. Unscheduled banners remain server-rendered; scheduled cached markup stays consistent with initial hydration regardless of its age.

4. **Forecasting and analysis views**
   - Forecast pages compare data sources and surface quality metrics.
   - Chart rows are memoized from their inputs. “Now” annotations retain input-triggered clock samples in small effects, with documented per-line lint exceptions for that external clock synchronization. Global Hooks purity and state-effect rules remain enabled.

5. **Water quality and CSO data**
   - Water-quality endpoints under `app/api/waterquality/*` expose:
     - latest water quality snapshot
     - CSO density time series
     - bulk CSO detail lookup
     - single CSO detail lookup
   - Querying and payload shaping for these endpoints live in `libs/services/waterQualityService.js`.
   - The latest snapshot classifies each upstream monitor as `active`, `recent`, `offline`, or `unknown`. An active claim requires both the summary and per-CSO record to be no more than 30 minutes old.
   - The summary response includes map-ready `locations` so clients do not issue a second request containing hundreds of IDs. Legacy summary fields remain additive compatibility fields.
   - CSO activity and four-hour river rise are combined by `libs/waterQualityIndicator.js`; calibrated thresholds are checked in and never recomputed during a request.
   - Required Mongo indexes and their explicit rollout procedure are documented in `docs/WATER_QUALITY_ROLLOUT.md`.

6. **Trent Lock submissions**
   - `app/api/trentlockapi/route.js` accepts user submissions and enriches them with Environment Agency station readings when available.
   - Submission orchestration and persistence live in `libs/services/trentLockService.js`.

7. **Trent gauge dashboard cache**
   - `app/api/trentweirs/route.js` is the app-owned cache boundary for Trent gauge pages.
   - `libs/services/trentWeirsService.js` fetches Environment Agency readings server-side per required measure type so mixed stations do not lose `level` history to `flow` rows.
   - `RDP_TRENT_SOURCE` (`legacy|shadow|rdp`, default `legacy`) selects the display source; `libs/rdp/trentSource.js` is loaded only outside legacy. Gauge alerts never read the display snapshot, its fallback or its cache, so the display switch never changes alert inputs. See [RDP-TRENT-51B.md](RDP-TRENT-51B.md).
   - `app/trentweirs/page.js` is now the overview-first Trent dashboard, combining summary cards and a comparison workspace on one page.
   - `components/functional/trentDashboard.js` centralizes the shared Trent dashboard controls so gauge selection, time window, and comparison mode are coordinated instead of repeated per card.
   - `app/trentcharts/page.js` now redirects to `app/trentweirs/page.js`, preserving the old route while keeping one primary Trent dashboard experience.

10. **Operational alerts and health**
   - Public alert signup lives under `app/api/alerts/route.js`; it supports Trent gauge thresholds, Colwick forecasts, HPP open/closed changes, and CSO risk thresholds.
   - Confirmation and unsubscribe flows live under `app/api/alerts/confirm/route.js` and `app/api/alerts/unsubscribe/route.js`.
   - Email-based alert management access lives under `app/api/alerts/manage-link/route.js`, `app/api/alerts/manage/route.js`, and the user-facing `app/alerts/page.js`.
   - Alert persistence and threshold-evaluation logic live in `libs/services/colwickAlertsService.js`; its legacy export name remains for compatibility with the original Colwick implementation.
   - The S3 forecast fetch/parse logic is shared via `libs/services/forecastService.js`, so both the public forecast API and internal alert evaluation use the same source of truth.
   - Scheduled evaluation runs via `app/api/internal/alerts/run/route.js` every 15 minutes. Subscription transitions use compare-and-set on `stateRevision`; a newly met condition is gated on the subscription (`pendingTransitionId`), recorded as an immutable delivery intent, then sent with a stable Resend idempotency key. Uncertain sends (timeout/5xx/409) are retried with the same key and payload only inside the provider idempotency window, then held for operator review. Each run writes an `alertRuns` record (`running` → `success|degraded|failed`, with interrupted runs later marked `incomplete`). The unique delivery index is verified, not created, at runtime (`npm run db:indexes:alerts`). See [ALERT_EVALUATION_RELIABILITY.md](ALERT_EVALUATION_RELIABILITY.md).
   - Live gauge rules (#51-D) read one bounded, uncached series per alerted measurement from the run's pinned `RDP_GAUGE_ALERTS_SOURCE` (`legacy` EA or `rdp`; `shadow` = legacy plus a pure, logged RDP comparison). Observed-time progress is stored on the subscription inside the same `stateRevision` compare-and-set; catch-up is chronological and bounded, notifications require the newest fresh (≤30 min) observation to still meet the rule, and ambiguous continuity holds the rule. Pure logic lives in `libs/alerts/`. See [RDP-GAUGE-ALERTS-51D.md](RDP-GAUGE-ALERTS-51D.md).
   - Alert emails are transactional and use a Resend-compatible HTTP integration. Required env vars are `SITE_URL`, `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, and `CRON_SECRET`.
   - Management links are email-scoped, 30-minute tokens stored separately from alert subscriptions so users can view and remove their alerts without a full account system. Confirmation links expire after 24 hours.
   - Operational APIs return additive `health` metadata (`source`, `generatedAt`, `fetchedAt`, `ageSeconds`, and `state`). Most feeds are stale after 30 minutes; predictor forecasts use a one-hour window. HPP status is fresh when its MongoDB query succeeds because its source only writes on 2.2m boundary transitions. The authenticated `/api/admin/operational-health` endpoint is the safe operator diagnostic view.
   - Operational-health diagnostics check the five sources concurrently and report integer `latencyMs` measured after each awaited check using a monotonic clock. A failed source returns sanitized `unavailable` health without concealing other results; unauthenticated requests return the standard `401` envelope before checking sources.

8. **Admin editing experience**
   - Admin pages now use a more consistent editing pattern across events and site banner workflows.
   - Event management uses a focused list-and-editor flow with consistent save/reset/delete feedback.
   - A removed selected event falls back to the first remaining event or new-event mode before its editor renders; refreshes preserve valid selections and explicit new-event mode.
   - Banner management includes preview, visibility toggle, scheduling controls, and clearer loading/success/error states.

9. **Home page static data strategy**
   - `app/page.js` uses App Router `unstable_cache` (`revalidate = 21600`) with tags (`home-snapshot`, `events`, `site-banner`) to cache events/banner and reduce load.
    - Data assembly for the home snapshot lives in `libs/services/homePageService.js`.
   - Home snapshot assembly tolerates partial Mongo-backed failures so banner and events can fall back independently.
   - Admin writes in `app/api/events/route.js` and `app/api/sitebanner/route.js` trigger `revalidateTag` for immediate snapshot refresh.
   - Operational data (levels/status/forecast/water quality) uses Route Handler `revalidate` at **15 minutes** and remains client-side via SWR at the same cadence.

10. **River level history (#104)**
   - `/history` explores Colwick observed levels by UK calendar year/month with zoom to 15-minute readings, time at/above the HPP 2.2 m level rule, seasonal context and year-on-year comparison.
   - `libs/history/*` holds pure calendar, quality, threshold-time and aggregation logic plus a server-only cached reader over the existing RDP client; routes are `/api/history/colwick/{month,year,overview}`.
   - The home page's former hard-coded 2012–2026 closure tables are replaced by `components/layout/frontpage/historicalConditions.js`, which loads independently of the operational `/api/hppstatus` rolling windows.
   - Figures are level-derived conditions, never HPP closure records. Details, eligibility rules and reconciliation are in [HISTORICAL_RIVER_CONDITIONS.md](HISTORICAL_RIVER_CONDITIONS.md).

11. **Historical high-water events (#105)**
   - `/history/events` and `/history/events/[id]` let visitors browse and open observed Colwick periods at or above 2.2 m (timeline, list, hydrograph, evidence-labelled start/peak/end).
   - Each cached month digest carries a threshold-state `timeline` (`libs/history/timeline.js`); `libs/history/events.js` stitches them and identifies events per request. Routes are `/api/history/colwick/events` and `/api/history/colwick/events/[id]`; no new reads, stores or infrastructure.
   - Events are river-level evidence only and never touch `openIndicator`, HPP transitions or alerts. See [HISTORICAL_RIVER_EVENTS.md](HISTORICAL_RIVER_EVENTS.md).

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
