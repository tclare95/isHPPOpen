# Design: Web engineering standards baseline

## Context

The web app runs Next.js 16 and React 19, with App Router route handlers and shared helpers. `next.config.js` still has a removed Next.js ESLint option; `.github/copilot-instructions.md` describes Next.js 15. Two files literally ending in ` (to modify)` under `__tests__/api` contain placeholder tests, distinct from current route-handler tests. The admin operational-health handler calculates successful-source latency before awaiting the check. CI already runs ESLint, Jest and a production build.

## Goals / Non-goals

**Goals:** Correct confirmed low-risk defects and stale engineering instructions, retain CI safeguards, add focused health-diagnostic tests, and document substantial findings for separate changes.

**Non-goals:** Change caching freshness/semantics, alter public APIs, rewrite API layers, change operational-alert cadence, upgrade Next.js/React, or migrate data.

## Decisions

1. **Use existing lint and test infrastructure.** Delete the unsupported `eslint` key from `next.config.js`, not the standalone ESLint command or CI step. Do not add a second lint pipeline.
2. **Keep one source of truth for instructions.** Update Copilot guidance for current architecture and link to `AGENTS.md`, `docs/ARCHITECTURE.md`, and OpenSpec. Avoid duplicating substantial policies that can drift.
3. **Time completed checks, not started promises.** Within each per-source `Promise.all` callback, capture start time, await the check, then compute elapsed time for either success or error. Preserve all existing fields, success behaviour and error isolation; don't log or return provider exception messages through the health endpoint. Tests should use controlled delayed/failed async checks or controlled clocks to prove timing. Keep the check set unchanged.
4. **Remove only proven placeholders.** Inspect the two ` (to modify)` files before deletion and retain ordinary tests. Their trivial assertions and attempted DB connection are not an intended integration-test contract.
5. **Audit lint exceptions without a rewrite.** Inspect violations and reason for each of `react/no-unescaped-entities`, `react/display-name`, `react-hooks/set-state-in-effect`, and `react-hooks/purity`; selectively re-enable rules only where fixes and regression coverage are small. Explicitly record deferrals with examples.
6. **Split unrelated architectural changes.** Deprecation of `unstable_cache`, single-argument `revalidateTag` semantics, service/API consolidation and alert cron frequency warrant separate behavioural and regression analysis; do not silently change them during this work.

## Risks / Trade-offs

- **Unexpected lint failures** -> recheck lint after config cleanup, preserve CI gate, defer broad rule enabling.
- **Misleading elapsed-time tests** -> use controlled asynchronous delays or deterministic clocks, test both success and failure, do not assert fragile exact wall-clock numbers.
- **Breaking authenticated diagnostics** -> assert 401 and envelope shape along with per-source result names and failure isolation.
- **Scope expansion** -> defer nontrivial findings to an evidence-based engineering backlog.

## Migration / Rollback

Ship as a standard protected-main web PR, with documented `npm run lint`, `npm test -- --ci --runInBand`, and `npm run build` results. No data changes or backend releases. A merge may deploy automatically to Vercel; rollback through the existing Vercel deployment / source-revert procedure.
