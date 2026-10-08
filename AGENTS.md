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
- `S3_LEVELS_URL` (public URL to `levels/latest.json` for operational levels feed)
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `AUTH0_DOMAIN`
- `NEXTAUTH_SECRET` (preferred; legacy `SECRET` fallback should be treated as temporary)

Without MongoDB env vars, imports from `libs/database.js` throw immediately.

## Architecture map
- **App Router app**: UI routes in `app/`, shared UI in `components/`.
- **API layer**: App Router route handlers in `app/api/*`.
- **API shared helpers**: `libs/api/http.js` provides shared error primitives/mapping used by route handlers.
- **App Router helpers**: `libs/api/httpApp.js` centralizes `NextResponse` envelopes, JSON body parsing, and route-handler session checks.
- **Service layer**: business logic extracted in `libs/services/*` for events, HPP status, levels, site banner, Trent Lock, and water-quality operations.
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
- Follow the newer route pattern used by levels, water quality, and Trent Lock endpoints: keep DB/query/transformation logic in services, not handlers.
- Use the balanced freshness policy: editorial/event content via ISR/static + tags, operational levels/status/forecast via Route Handler revalidate + SWR (~15 minutes).
- For App Router route handlers, export per-method handlers (`GET`, `POST`, etc), keep one route-level `try/catch`, and map errors via `mapApiError()`.
- For homepage-critical operational `GET` endpoints, prefer intentional fallback payloads over hard failures during transient Mongo outages when that avoids client breakage.
- Preserve unauthenticated `GET` for public data endpoints unless explicitly requested otherwise.
- Use `requireRouteSession()` for protected writes and return `401` when unauthenticated.
- Use `403` only for authenticated users who lack permission.
- Prefer `{ message: "..." }` for error payloads.
- Prefer shared request logging helpers over inline `console.*` formatting in routes.
- If adding new API behavior, add/update a corresponding test in `__tests__/api/`.
- When touching DB logic, keep connection reuse through `connectToDatabase()`.
- Prefer readable, high-quality, DRY code over clever abstractions; add helpers when they remove duplication and improve clarity, not just to increase indirection.
- Avoid broad refactors unless needed for the task.

## Definition of done for agent PRs
1. Code/documentation changes complete.
2. `npm test` passes (or explain environmental limitations).
3. `npm run lint` passes (or explain environmental limitations).
4. Update docs when behavior or architecture changes.


## Suite specifications and cross-repository work

- Canonical suite planning uses [OpenSpec](openspec/config.yaml): active proposals are in `openspec/changes/<descriptive-name>/` with `proposal.md`, capability deltas, `design.md` and `tasks.md`; completed requirements are archived/synced into `openspec/specs/`. Use `openspec status --change <name>` and `openspec validate <name> --strict` when the CLI is available. Current-state architecture documentation remains authoritative for behaviour not yet covered by OpenSpec.
- Shared producer/consumer contracts: [docs/CONTRACTS.md](docs/CONTRACTS.md); suite ownership and rollout: [docs/SYSTEM.md](docs/SYSTEM.md).
- A cross-repository feature has one descriptively named OpenSpec change and separate implementation PRs in web, scraper and/or predictor repositories. Link the change path in each PR; do not create a competing specification registry.
- Confirm producer formats and downstream readers before changing S3 keys, CSV fields, MongoDB collections, cadence, station IDs, units or timestamp semantics. Prefer additive producer changes and coordinated consumer migration.
- Deployments are independently authorized: merging web main may deploy to Vercel; AWS backends require reviewed manual release workflows. Do not deploy or mutate production as an incidental part of a documentation/spec task.


## Suite idea backlog

- GitHub [roadmap / ideas index #57](https://github.com/tclare95/isHPPOpen/issues/57) links near-term OpenSpec changes and individually tracked future ideas. Capture ideas as GitHub issues, not an additional Markdown backlog; link selected issues to a canonical OpenSpec change.
- Backend-neutral storage evaluation is [evaluate-data-storage](openspec/changes/evaluate-data-storage/proposal.md) (investigation only). Do not select or implement a database while the decision remains open. The [configurable-gauge-ingestion](openspec/changes/configurable-gauge-ingestion/proposal.md) persistence work depends on it.
