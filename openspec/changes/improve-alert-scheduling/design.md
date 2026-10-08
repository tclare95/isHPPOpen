# Design: Operational alert scheduling

## Current state

- `vercel.json` invokes `/api/internal/alerts/run` every 15 minutes; its route authenticates using `CRON_SECRET`.
- `libs/services/colwickAlertsService.js` evaluates gauge, forecast, HPP-status and water-quality alert types, stores `alertRuns`, maintains `alertSubscriptions` state and uses `alertDeliveries` to deduplicate per transition.
- `sendOnce` uses a unique `alertKey` / `transitionId` index and `claimed` / `sent` / `failed` delivery states. Check index creation during the cron run, atomicity of concurrent claims and recovery from abandoned claims before reducing the interval.
- Existing upstream collection is not on the same timeline as the web cron; the web uses a 15-minute operational fetch cache and source-specific freshness signals.

## Decision and rollout

1. **Baseline first.** Record representative run times, source ages, rate of alerts/duplicate suppression, existing error handling and Vercel costs. Separate observed conditions from assumptions.
2. **Harden transition lifecycle before schedule change.** Prefer a durable single-writer lease or equivalent atomic state/claim transitions rather than an in-memory lock. A unique delivery index alone does not prove all subscription state updates are race-safe. Provision/verify indexes through explicit, reviewed setup rather than creating them on every runtime invocation.
3. **Handle email uncertainty.** Preserve the existing provider idempotency key, record claimed/send failures and make abandoned claims visible with a deliberate safe recovery policy; do not promise impossible exactly-once SMTP-like semantics.
4. **Gate on freshness.** Confirm all alert inputs are checked against genuine source timestamps and do not treat a successful cached HTTP response as fresh observation data. Keep healthy alert types evaluable when another source fails.
5. **Controlled cadence experiment.** If tests and the baseline justify it, change only the Vercel cron to `*/5 * * * *` and observe results. If five-minute runs show little user benefit or introduce risk, retain 15 minutes.
6. **Rollback.** Restore `*/15 * * * *` through the normal reviewed web release; keep DB transitions and subscription state backward-compatible.

## Verification

Unit/integration tests with controlled time and concurrent evaluator calls; simulate duplicate cron execution, race, stale input, independently failed sources, provider uncertainty, clear/re-arm and recoverable run state. Use mocks for database, downstream feeds and email, never live addresses. Verify existing alerts API tests, lint and build. Report the recommendation based on evidence and explicitly record the final chosen cadence.

## Risks and boundaries

A five-minute cron can raise email-provider and DB overhead without fresher upstream data. An in-process lock does not protect multiple Vercel instances. Index creation may require an operational step; no unapproved production schema writes. No scraper or predictor deployment is part of this change.
