# AGENTS.md

This file helps coding agents work safely and effectively in this repository.

## Project quickstart
- Install dependencies: `npm ci`
- Run dev server: `npm run dev`
- Run lint: `npm run lint`
- Run tests: `npm test`
- Run coverage: `npm run test:coverage`
- Node runtime baseline: **20.19+**

## Environment variables
Create `.env.local` with values for:
- `MONGODB_URI`
- `MONGODB_DB`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_DOMAIN`
- `NEXTAUTH_SECRET` (or legacy `SECRET` fallback)

Without MongoDB env vars, imports from `libs/database.js` throw immediately.

## Architecture map
- **App Router app**: UI routes in `app/`, shared UI in `components/`.
- **API layer**: App Router route handlers in `app/api/*`.
- **API shared helpers**: `libs/api/http.js` provides shared error primitives/mapping used by route handlers.
- **App Router helpers**: `libs/api/httpApp.js` centralizes `NextResponse` envelopes, JSON body parsing, and route-handler session checks.
- **Service layer**: business logic extracted in `libs/services/*` for events and site banner operations.
- **Data layer**: `libs/database.js` manages a cached singleton Mongo client.
- **State/fetching**: SWR-based data hooks in `libs/useFetch.js` and helpers in `libs/fetcher.js`.
- **Testing**: Jest + Testing Library under `__tests__/` with DB/auth mocks in `__mocks__/`.

For details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md).

### Source-of-truth docs
- API route standards and response conventions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Agent workflow and PR definition-of-done: [AGENTS.md](AGENTS.md)
- Historical pitfalls and change guidance: [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md)

Keep this file focused on actionable guardrails. If architecture behavior changes, update [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first, then adjust this file only where agent workflow is impacted.

## Agent guardrails
- Prefer changing service modules (`libs/services`) over duplicating logic in API routes.
- Keep API handlers thin: validate input, authorize, delegate, shape response.
- Use the balanced freshness policy: editorial/event content via ISR/static + tags, operational levels/status/forecast via Route Handler revalidate + SWR (~15 minutes).
- For App Router route handlers, export per-method handlers (`GET`, `POST`, etc), keep one route-level `try/catch`, and map errors via `mapApiError()`.
- Preserve unauthenticated `GET` for public data endpoints unless explicitly requested otherwise.
- Use `requireRouteSession()` for protected writes and return `401` when unauthenticated.
- Use `403` only for authenticated users who lack permission.
- Prefer `{ message: "..." }` for error payloads.
- Prefer shared request logging helpers over inline `console.*` formatting in routes.
- If adding new API behavior, add/update a corresponding test in `__tests__/api/`.
- When touching DB logic, keep connection reuse through `connectToDatabase()`.
- Avoid broad refactors unless needed for the task.

## Definition of done for agent PRs
1. Code/documentation changes complete.
2. `npm test` passes (or explain environmental limitations).
3. `npm run lint` passes (or explain environmental limitations).
4. Update docs when behavior or architecture changes.
