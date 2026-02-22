# Architecture and Core Functionality

Related docs:
- Project setup and commands: [README.md](../README.md)
- Contribution/agent guardrails: [AGENTS.md](../AGENTS.md)
- Historical pitfalls and rationale: [docs/LESSONS_LEARNED.md](LESSONS_LEARNED.md)

## 1) Runtime and framework
- The app runs on the **App Router**.
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
| Events | `eventschemas` | App Router ISR (`app/page.js` + `revalidate`) for home snapshot, SWR for interactive lists | ISR: **6h**; SWR: on demand/focus | Events usually change infrequently; static home snapshot reduces DB load while admin/public event views can still refresh when needed. |
| Site banner | `sitebannerschemas` | App Router ISR (`app/page.js` + `revalidate`) for home header, SWR in admin editor | ISR: **6h**; SWR: on demand/focus | Banner is editorial and low-frequency, but admin tooling should reflect recent writes quickly. |
| HPP status | `openIndicator` | SWR client fetch (`/api/hppstatus`) | **15m** (`900000ms`) | Status is operational and should stay reasonably fresh without aggressive polling. |
| River levels | `riverschemas` | SWR client fetch (`/api/levels`) | **15m** (`900000ms`) | Upstream level data typically updates on a 15-minute cadence. |
| Forecast data | S3 forecast + derived APIs | SWR client fetch (`/api/s3forecast`, `/api/forecastaccuracy`) | **15m** (`900000ms`) | Forecast and related quality indicators are operational and align to the same source update interval. |

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

### Service layer
- Domain logic has begun moving into service modules:
  - `libs/services/eventsService.js`
   - `libs/services/hppStatusService.js`
  - `libs/services/siteBannerService.js`
- These services encapsulate validation + persistence calls used by API handlers.

### Data layer
- MongoDB connectivity is centralized in `libs/database.js`.
- It uses a global cached promise/connection pattern to avoid reconnecting on every request.

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
   - Authenticated admin updates banner content and scheduling.

4. **Forecasting and analysis views**
   - Forecast pages compare data sources and surface quality metrics.

5. **Home page static data strategy**
    - `app/page.js` uses App Router ISR (`export const revalidate = 21600`) to cache events/banner and reduce load.
    - Data assembly for the home snapshot lives in `libs/services/homePageService.js`.
    - Operational data (levels/status/forecast) remains client-side via SWR with a **15-minute** refresh cadence.

## 6) App Router status
- Completed:
   - Root route and feature pages use App Router (`app/page.js` + route segments).
   - NextAuth route uses App Router (`app/api/auth/[...nextauth]/route.js`).
   - API endpoints are implemented as Route Handlers under `app/api/*`.
- Remaining enhancements:
   - Introduce cache tags/revalidation (`revalidateTag`) where admin mutations should invalidate static snapshots immediately.
   - Continue extracting reusable domain logic into `libs/services/*` as endpoints evolve.

## 4) Testing strategy
- Jest powers both API route tests and component/unit tests under `__tests__/`.
- Mocks for DB/auth/live dependencies live in `__mocks__/`.
- Recommended baseline check before merge:
  - `npm test`
  - `npm run lint`

## 5) Known architectural characteristics
- Some logic remains in route handlers while newer behavior uses `libs/services`.
- Some endpoints still accept legacy body shapes; `parseRequestBody()` exists to smooth migration.
- Continued value: move remaining domain logic from handlers to `libs/services` while preserving the shared route contract.
