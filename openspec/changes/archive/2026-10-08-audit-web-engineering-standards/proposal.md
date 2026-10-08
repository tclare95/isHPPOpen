# Proposal: Audit web engineering standards

## Why

isHPPOpen has moved to Next.js 16 and acquired several operational features, but parts of its tooling and agent guidance still reflect older implementations. A limited clean-up can correct a confirmed operational-health diagnostic defect, remove obsolete artifacts and establish a prioritised engineering baseline without launching a general refactor.

## What Changes

- Remove the obsolete `eslint.ignoreDuringBuilds` option in `next.config.js`; retain `npm run lint` and the GitHub CI lint gate.
- Refresh outdated `.github/copilot-instructions.md` references (including Next.js 15, Mongo-only levels, and the legacy secret name); cross-link authoritative `AGENTS.md` and architecture docs rather than duplicating all policy.
- Verify and remove two obsolete, unusually named placeholder files under `__tests__/api/` ending in ` (to modify)`. Keep the actual, functioning route-handler tests.
- Correct the authenticated operational-health API's `latencyMs` timing for successful checks (currently evaluated before `await check()`). Add focused tests for success, source failure, and unauthorized access; preserve the endpoint's existing response shape and per-source failure isolation.
- Review the four globally disabled React/React Hooks ESLint rules. Re-enable only where a bounded, verified fix is possible; record substantive cleanup as follow-up work rather than introducing unrelated component refactors.
- Produce an evidence-backed, prioritised follow-up backlog for nontrivial findings. Keep this change bounded to verified low-risk improvements.

## Capabilities

### New Capabilities

- `operational-health`: Codify the existing authenticated operational-health endpoint's observable contract and accurate per-source execution duration, including independent handling of failed checks.

### Modified Capabilities

None. No existing OpenSpec capability is being changed. Tooling and documentation cleanup is not itself a product capability.

## Impact

- **Repository:** `tclare95/isHPPOpen` only; no scraper or predictor code changes.
- **Likely paths:** `next.config.js`, `eslint.config.mjs`, `.github/copilot-instructions.md`, `__tests__/api/`, `app/api/admin/operational-health/route.js`, and a short follow-up engineering backlog.
- **External interfaces:** preserve API response fields, authentication, feed formats, cron cadence and user-visible behaviour; no data migration or dependencies added.
- **Release:** use a protected-main PR with `npm run lint`, `npm test -- --ci --runInBand`, and `npm run build`. A web main merge can deploy to Vercel; normal release review and rollback apply.

## Non-goals

No framework migration, broad React refactor, TypeScript conversion, database or provider overhaul, cache-semantic migration, cron change, major UI work, authentication redesign, production infrastructure action, or bulk renaming of legacy interfaces.

## Done when

The listed bounded fixes and regression tests are merged with passing CI; the documented standards match the implemented toolchain; no intentional API/product behaviour regression occurs; and substantive outstanding findings are recorded as separately actionable follow-ups.
