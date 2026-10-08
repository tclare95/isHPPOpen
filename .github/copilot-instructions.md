# Copilot instructions for isHPPOpen

Next.js 16 / React 19 App Router application for Holme Pierrepont course status,
running on Node 20.19+ and deployed on Vercel. UI uses React Bootstrap and SWR;
admin authentication uses Auth0 through NextAuth.

Read the maintained guidance before changing code:
- [AGENTS.md](../AGENTS.md): commands, guardrails and PR checks.
- [Architecture](../docs/ARCHITECTURE.md): services, API envelopes, auth and freshness.
- [Shared contracts](../docs/CONTRACTS.md): scraper/predictor producers and web consumers.
- [OpenSpec](../openspec/config.yaml): canonical suite specifications; active changes
  live in `openspec/changes/` and implemented requirements in `openspec/specs/`.
- [README](../README.md): local setup and complete environment-variable list.

Route Handlers in `app/api/` validate and authorize requests, then delegate to
`libs/services/`. Reuse `libs/api/httpApp.js`, `libs/api/http.js` and the cached
MongoDB connection in `libs/database.js`. Public reads stay public; protected
routes use `requireRouteSession()`.

Operational levels are scraper-produced S3 JSON configured by `S3_LEVELS_URL`,
read by `libs/services/levelsService.js`. Predictor forecasts are S3 CSV configured
by `S3_FORECAST_URL`, read by `libs/services/forecastService.js`. MongoDB stores
events, banners, HPP status, water quality and alerts; `riverschemas` is a legacy
levels collection, not the current `/api/levels` source.

Use `NEXTAUTH_SECRET`; `SECRET` is a temporary legacy fallback. Configure
`NEXTAUTH_URL` with a scheme (`http://localhost:3000` locally). See README for
MongoDB, Auth0, S3 and alert-email configuration. Do not commit local env files.

Use existing Jest/Testing Library patterns in `__tests__/`; mock services and
NextAuth for Route Handler tests rather than connecting to a live database.
`jest.setup.js` supplies shared mocks; `.env.test` is optional for mocked tests.

Before submitting: `npm run lint`, `npm test -- --ci --runInBand`, `npm run build`.
CI runs all three separately; Next.js 16 builds do not run ESLint. Keep the CI
lint gate. Production actions require separate authorization; merging web main
may trigger a Vercel deployment.
