# Tasks: Reversible RDP web consumer migration (#51)

Docs only: all future implementation tasks unchecked. Keep web implementation in `isHPPOpen`, backend #69 separate.

## A. Shared server-side client and rollout controls
- [ ] 1.1 Implement Vercel OIDC/STS SigV4 client for the #69 API, with bounded timeouts/retries, stage-specific endpoints/roles and server-only credential handling.
- [ ] 1.2 Implement validated canonical alias mappings for all six dashboard series, preserving distinct Shardlow level/flow.
- [ ] 1.3 Add independent `RDP_TRENT_SOURCE`, `RDP_LEVELS_SOURCE`, `RDP_GAUGE_ALERTS_SOURCE` `legacy|shadow|rdp` modes, default legacy, with strict environment isolation and redeploy-based rollback.
- [ ] 1.4 Cover 403, 429, 5xx, timeout, partial latest, bad measurement, cursor/archival corruption and wrong-stage IAM in contract tests; no browser tokens or public RDP URL.

## B. Trent dashboard
- [ ] 2.1 Adapt bounded paginated 7d RDP history to existing six-series newest-first `/api/trentweirs` public contract, including 1h/1d index-based rates and units.
- [ ] 2.2 Implement non-mutating legacy-authoritative shadow comparisons on matched timestamps, lag, missing history, per-source health and derived rates.
- [ ] 2.3 In RDP mode provide per-complete-measurement validated fresh legacy display fallback; stale last-known must remain stale. Fix fallback-vs-stale health precedence.
- [ ] 2.4 Document and test 48h shadow review and 7d sample parity evidence, six-series readiness and per-consumer Vercel/cache rollback.

## C. Observed Colwick levels
- [ ] 3.1 Read `level_data` from RDP while preserving legacy `forecast_data` and exact public `/api/levels` field shapes.
- [ ] 3.2 Keep observation and forecast health independent, with fresh legacy display fallback and honest stale/unavailable states.
- [ ] 3.3 Add fixture contract tests for independent failures and selection/rollback; no predictor changes.

## D. Live gauge alerts
- [ ] 4.1 Add alert-safe per-measure live gauge reader that does not inherit dashboard legacy or cached-display automatic fallback; pin source choice per alert run.
- [ ] 4.2 Preserve existing subscription state, hysteresis, alert keys and email delivery idempotency; record/use an observed-time watermark to avoid source-switch false crossings/rearming.
- [ ] 4.3 On unavailable/old/stale/unknown data skip only affected gauge rules, leave state unchanged and allow unaffected gauge/HPP/water/forecast rules.
- [ ] 4.4 Shadow-evaluate safely without sending emails or changing subscriptions, deliveries, alertRuns or watermarks; test mocked threshold transitions, rollback and duplicate sends.

## E. Evidence/release
- [ ] 5.1 Run Jest, ESLint and Next.js production build; attach contract snapshots, measurement-alias review, expected lag/coverage and shadow report to #51.
- [ ] 5.2 Document Preview/stage versus Production/prod access denial, server-only permissions, role deployment, 900s cache behaviour, configuration promotion and tested manual rollback.
- [ ] 5.3 Independently activate in order Trent → observed levels → gauge alerts only after #69/#52 and necessary #50 coverage exist and separate production approvals are recorded.

## Non-goals
No new backend read Lambda, public API, dynamic feature flag service, changes to old Node scraper, HPP state events, water quality or forecast engine.
