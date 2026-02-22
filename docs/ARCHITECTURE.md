# Architecture and Core Functionality

Related docs:
- Project setup and commands: [README.md](../README.md)
- Contribution/agent guardrails: [AGENTS.md](../AGENTS.md)
- Historical pitfalls and rationale: [docs/LESSONS_LEARNED.md](LESSONS_LEARNED.md)

## 1) Runtime and framework
- The app is a **Next.js Pages Router** application.
- Server-rendered/static page entry points live in `pages/`.
- API endpoints are implemented as Next.js API routes in `pages/api/`.

## 2) High-level layers

### Presentation layer
- UI is composed from reusable React components in `components/`.
- Page composition is primarily in `pages/index.js` and additional feature pages like `pages/forecastinfo.js`, `pages/trentweirs.js`, and admin pages under `pages/admin/`.
- Bootstrap + React-Bootstrap are used for layout and widgets.

### Client data access
- SWR is used for client-side polling/caching via `libs/useFetch.js` + `libs/fetcher.js`.
- Graph thresholds are shared through context in `libs/context/graphcontrol.js`.

### API/application layer
- Public and protected server handlers are in `pages/api/*`.
- Shared route concerns are centralized in `libs/api/http.js`.
- Current standard route pattern is:
   - define a small per-method handler map (`handlers`)
   - dispatch methods via shared `getMethodHandler()`
   - keep one route-level `try/catch` boundary
   - map errors with shared `mapApiError()`
- Examples:
  - `pages/api/events.js`: read/update/delete events.
  - `pages/api/sitebanner.js`: get/update banner messages.
  - `pages/api/hppstatus.js`: computes closure days over time windows.
  - `pages/api/featureflags.js`: returns feature flag configuration.

### Service layer
- Domain logic has begun moving into service modules:
  - `libs/services/eventsService.js`
  - `libs/services/siteBannerService.js`
- These services encapsulate validation + persistence calls used by API handlers.

### Data layer
- MongoDB connectivity is centralized in `libs/database.js`.
- It uses a global cached promise/connection pattern to avoid reconnecting on every request.

### AuthN/AuthZ
- NextAuth is configured in `pages/api/auth/[...nextauth].js` using Auth0 provider.
- Protected mutations (e.g., POST/DELETE in events, POST in site banner) rely on server session checks via shared `requireSession()`.
- Unauthenticated protected writes return `401` with `{ message: "Unauthorized" }`.

## 2.1) API route conventions
- Prefer `message` as the standard error response key.
- For method mismatches, set `Allow` and return `405`.
- Prefer domain-level throws (`HttpError`, Yup validation errors) and route-level mapping in `mapApiError()`.
- Keep route handlers focused on orchestration; place domain validation/persistence in services where available.

### Response contract (current standard)
- Success responses should use: `{ ok: true, data: ... }`
- Error responses should use: `{ ok: false, error: { message: string } }`
- `405` should return JSON in the same error shape and include `Allow`.
- Frontend fetch helpers should unwrap `{ ok: true, data }` to keep consumer code simple.
- For empty-state reads (e.g. `hppstatus` with no records), prefer `200` with explicit empty payload metadata over `500`.

## 3) Important functionality

1. **Open/closed status insights**
   - `pages/api/hppstatus.js` processes historical status records and returns:
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
   - Feature toggles are available through `/api/featureflags`.

5. **Home page static data strategy**
   - `pages/index.js` uses `getStaticProps` with revalidation to cache events/banner and reduce load.

## 4) Testing strategy
- Jest powers both API route tests and component/unit tests under `__tests__/`.
- Mocks for DB/auth/live dependencies live in `__mocks__/`.
- Recommended baseline check before merge:
  - `npm test`
  - `npm run lint`

## 5) Known architectural characteristics
- The codebase is in a transition state: some logic is still in route handlers while newer behavior uses `libs/services`.
- Some endpoints still accept legacy body shapes; `parseRequestBody()` exists to smooth migration.
- Continued value: move remaining domain logic from handlers to `libs/services` while preserving the shared route contract.
