# Tasks: Web engineering standards baseline

## 1. Framework/tooling configuration

- [x] 1.1 Remove obsolete `eslint.ignoreDuringBuilds` from `next.config.js`, preserving redirects and output settings; verify `npm run lint` and `npm run build` pass.
- [x] 1.2 Audit the four globally disabled rules in `eslint.config.mjs`; re-enable only individually verified low-risk cases, and record remaining examples and rationale in a bounded follow-up backlog. Verify the lint command succeeds.

## 2. Contributor guidance and repository hygiene

- [x] 2.1 Update `.github/copilot-instructions.md` for the actual Next.js 16 App Router, environment-variable names and source contracts; link to authoritative `AGENTS.md`, `docs/ARCHITECTURE.md` and `openspec/config.yaml`. Verify links and commands against current files.
- [x] 2.2 Inspect and delete only the two obsolete `__tests__/api/* (to modify)` placeholders, preserving their real-name equivalents. Verify actual API tests still run with `npm test -- --ci --runInBand`.

## 3. Operational health behaviour

- [x] 3.1 Correct `latencyMs` evaluation in `app/api/admin/operational-health/route.js` so elapsed time includes the completed async check on success and failure; preserve endpoint shape, auth and per-source isolation. Verify using a targeted Jest test.
- [x] 3.2 Add focused route-handler regression tests for an authenticated response, unauthenticated 401, measured async success/failure duration, unchanged fields and independent source failures. Run the targeted tests and confirm the protected endpoint does not expose exception details.

## 4. Findings and integration verification

- [x] 4.1 Document concrete, prioritised follow-ups (location, evidence, user/engineering impact, suggested bounded next action) for deferred caching, lint and structural work. Verify each is not accidentally implemented as part of this change.
- [x] 4.2 Run `npm run lint`, `npm test -- --ci --runInBand`, and `npm run build`; report results and environmental limitations in the implementation PR. Confirm no public API, cron schedule, storage contract or production configuration changed.

## Workflow follow-up

- After implementation review, archive this OpenSpec change using the OpenSpec workflow so `operational-health` becomes a current-system capability spec.
- Publishing or deploying the merged code remains governed by the web production release process.


## Verification (8 October 2026)

- `npm run lint`: passed, zero errors; nine pre-existing unused test suppression warnings.
- `npm test -- --ci --runInBand`: 40 suites and 159 tests passed, including five operational-health checks.
- `npm run build`: passed after final code changes with CI-only MongoDB/auth placeholders; unavailable local DB and unset feed URLs exercised existing fallback logs. No production credentials or source access used.
- Astra review: monotonic-clock finding addressed; re-review found no outstanding code findings and independently passed targeted tests and ESLint.
- All Copilot guidance links and commands checked against tracked files.
- Deferred evidence and separate issue links (#55, #56, #51): `docs/ENGINEERING_BACKLOG.md`.
- Only web code/docs changed; source formats, cron, storage, CI gates and production settings preserved.
- OpenSpec archive is included in the implementation PR; merge/release approval remains separate. Issue #46 stays open until the implementation PR merges.
