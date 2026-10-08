# Tasks: Operational alert scheduling

## 1. Baseline and invariants

- [ ] 1.1 Document existing 15-minute schedule, source/update intervals, Vercel runtime costs, current `alertRuns` metrics and typical evaluation durations. Distinguish measured figures from estimates.
- [ ] 1.2 Trace `sendOnce` / subscription update ordering and index creation. Record concrete races, stale `claimed` recovery gaps, provider-idempotency assumptions and the required no-duplicate guarantees.

## 2. Reliability improvements

- [ ] 2.1 Make delivery claims and subscription transitions safe across overlapping invocations. Add deterministic concurrency and retry tests; keep delivery and alert API compatibility.
- [ ] 2.2 Implement explicit failure/unknown-send handling and reviewable stale-claim recovery, including a safe index-provisioning approach. Add regression tests without sending external emails.
- [ ] 2.3 Verify freshness of each alert input and independence across healthy/failed source types; test no new notifications/re-arm from stale data and preservation of the current thresholds.

## 3. Operational visibility

- [ ] 3.1 Persist bounded, non-sensitive run health (success/degraded/failure, durations, source failures and counters); ensure an operator can detect an absent expected run without exposing subscriber details.
- [ ] 3.2 Test internal endpoint authentication and run reporting under success, stale data and partial/full failure.

## 4. Schedule decision and validation

- [ ] 4.1 Evaluate an opt-in five-minute schedule trial after reliability work, comparing expected alert latency, input freshness, costs and operational risk against baseline; document whether the change is warranted.
- [ ] 4.2 If approved, change only the Vercel cron configuration, document a 15-minute rollback, verify `npm run lint`, `npm test -- --ci --runInBand` and `npm run build`; record evidence and implementation PR in [#47](https://github.com/tclare95/isHPPOpen/issues/47).

Implementation PRs must be reviewed before any auto-deploying main merge. This task list does not authorise live cron invocations, production emails or backend deployment.
