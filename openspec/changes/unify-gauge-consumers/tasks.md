# Tasks: Reversible RDP web consumer migration (#51)

Slice A implemented with fixture tests; genuine Preview build federation remains separately approval-gated. Slice B code (2.1–2.3) and slice C (3.1–3.3) are implemented with fixture tests; B's live evidence (2.4), C's live shadow evidence and D–E remain future work. Keep web implementation in `isHPPOpen`, backend #69 separate.

## A. Shared server-side client and rollout controls
- [x] 1.1 Implement Vercel OIDC/STS SigV4 client for the #69 API, with bounded timeouts/retries, stage-specific endpoints/roles and server-only credential handling.
- [x] 1.2 Implement validated canonical alias mappings for all six dashboard series, preserving distinct Shardlow level/flow.
- [x] 1.3 Add independent `RDP_TRENT_SOURCE`, `RDP_LEVELS_SOURCE`, `RDP_GAUGE_ALERTS_SOURCE` `legacy|shadow|rdp` modes, default legacy, with strict environment isolation and redeploy-based rollback.
- [x] 1.4 Cover 403, 429, 5xx, timeout, partial latest, bad measurement, cursor/archival corruption and wrong-stage IAM in contract tests; no browser tokens or public RDP URL.

Slice A's controls are validated helpers only; no consumer reads them yet. See [implementation/evidence runbook](../../../docs/RDP-CLIENT-51A.md). Three reserved aliases still require #52 backend publication; production API configuration is fixture-tested only.

## B. Trent dashboard
- [x] 2.1 Adapt bounded paginated 7d RDP history to existing six-series newest-first `/api/trentweirs` public contract, including 1h/1d index-based rates and units.
- [x] 2.2 Implement non-mutating legacy-authoritative shadow comparisons on matched timestamps, lag, missing history, per-source health and derived rates.
- [x] 2.3 In RDP mode provide per-complete-measurement validated fresh legacy display fallback; stale last-known must remain stale. Fix fallback-vs-stale health precedence.
- [ ] 2.4 Document and test 48h shadow review and 7d sample parity evidence, six-series readiness and per-consumer Vercel/cache rollback.

Slice B: see [implementation runbook](../../../docs/RDP-TRENT-51B.md). All deployed modes remain `legacy`. The 2.4 review procedure and fixture parity tests exist; live shadow evidence needs #52 publication of the three reserved IDs, Preview function-runtime federation and separate approval.

## C. Observed Colwick levels
- [x] 3.1 Read `level_data` from RDP while preserving legacy `forecast_data` and exact public `/api/levels` field shapes.
- [x] 3.2 Keep observation and forecast health independent, with fresh legacy display fallback and honest stale/unavailable states.
- [x] 3.3 Add fixture contract tests for independent failures and selection/rollback; no predictor changes.

Slice C: see [implementation runbook](../../../docs/RDP-LEVELS-51C.md). All deployed modes remain `legacy`. Live shadow evidence needs Preview function-runtime federation and separate approval; Colwick (`ea-colwick-level`) is not one of the three #52-reserved IDs.

## D. Live gauge alerts — approved design, not implemented
**Prerequisite:** implement the **reliability-only** parts of #47 in an independent reviewed PR, with concurrency/retry, delivery-claim, state consistency and `alertRuns` recovery evidence. Leave `vercel.json` at 15 minutes; a five-minute trial is separate. Do not mandate a particular lease, schema or PR split: choose the smallest correct implementation.

- [ ] 4.1 Introduce a per-measurement alert-safe legacy/RDP reader, pin source per evaluation and refuse automatic display/cached legacy fallback. Validate identities, units, quality and locally checked ≤30-minute observation age.
- [ ] 4.2 Preserve existing subscription/delivery state, reconcile initial observation progress without resetting/rearming, and use bounded chronological catch-up. Notify only if the latest eligible fresh observation remains above/below threshold; hold ambiguous history rather than guessing.
- [ ] 4.3 Prevent source-switch/rollback false crossings from old **or newer but inconsistent** readings, including overlapping deployments; allow operator-reviewed reconciliation and preserve non-gauge independence.
- [ ] 4.4 Add a **read-only RDP shadow** path while legacy stays authoritative. Verify zero shadow-side subscription, delivery, `alertRuns`, progress writes or sends, plus mismatch/lag reporting without sensitive data.
- [ ] 4.5 Add deterministic regression tests for stale/unknown/quality errors, 15-minute repeats, out-of-order/gaps, both hysteresis directions, late-cleared crossings, uncertain/expired email retry, concurrency, shadow and rollback. Choose/document reasonable catch-up bounds using observed lag rather than hard-coded speculative values.

**Accepted 31 October decisions:** #47 reliability first (no cadence change); preserve/reconcile existing state; bounded chronological catch-up with latest-condition-only notification; 30-minute latest-observation freshness; hold incompatible source switches/rollback; operator review rather than blind resend after idempotency expiry.



## E. Evidence/release
- [ ] 5.1 Run Jest, ESLint and Next.js production build; attach contract snapshots, measurement-alias review, expected lag/coverage and shadow report to #51.
- [ ] 5.2 Document Preview/stage versus Production/prod access denial, server-only permissions, role deployment, 900s cache behaviour, configuration promotion and tested manual rollback.
- [ ] 5.3 Independently activate in order Trent → observed levels → gauge alerts only after #69/#52, suitable recent production observations, separately approved production access and the #47 reliability-only prerequisite. Preserve independent rollback and hold/reconciliation evidence; full #50 backfill is not required.

## Non-goals
No new backend read Lambda, public API, dynamic feature flag service, changes to old Node scraper, HPP state events, water quality or forecast engine.
