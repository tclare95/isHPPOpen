# AGENTS.md

This file helps coding agents work safely and effectively in this repository.

## Project quickstart
- Install dependencies: `npm ci`
- Run dev server: `npm run dev`
- Run lint: `npm run lint`
- Run tests: `npm test`
- Run coverage: `npm run test:coverage`

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
- **Pages router app**: UI routes in `pages/`, shared UI in `components/`.
- **API layer**: `pages/api/*` contains server handlers for levels, status, events, forecasts, site banner, feature flags, and auth.
- **Service layer**: business logic extracted in `libs/services/*` for events and site banner operations.
- **Data layer**: `libs/database.js` manages a cached singleton Mongo client.
- **State/fetching**: SWR-based data hooks in `libs/useFetch.js` and helpers in `libs/fetcher.js`.
- **Testing**: Jest + Testing Library under `__tests__/` with DB/auth mocks in `__mocks__/`.

For details, see `docs/ARCHITECTURE.md` and `docs/LESSONS_LEARNED.md`.

## Agent guardrails
- Prefer changing service modules (`libs/services`) over duplicating logic in API routes.
- Keep API handlers thin: validate input, authorize, delegate, shape response.
- Preserve unauthenticated `GET` for public data endpoints unless explicitly requested otherwise.
- If adding new API behavior, add/update a corresponding test in `__tests__/api/`.
- When touching DB logic, keep connection reuse through `connectToDatabase()`.
- Avoid broad refactors unless needed for the task; this repo has legacy and newer patterns co-existing.

## Definition of done for agent PRs
1. Code/documentation changes complete.
2. `npm test` passes (or explain environmental limitations).
3. `npm run lint` passes (or explain environmental limitations).
4. Update docs when behavior or architecture changes.
