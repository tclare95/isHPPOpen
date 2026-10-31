# Design: Three independently switchable RDP gauge consumers

## Authenticated client and aliases
- Keep all RDP access inside Next.js server-side modules. Use the existing `#69` `/v1/measurements`, batch latest, observations and health contracts. Use short-lived Vercel OIDC AWS STS credentials and SigV4 signed HTTP requests; never forward tokens, AWS keys, signed headers, internal endpoint or sensitive errors to browser payloads.
- Pin backend AWS region, correct API origin and project/environment-specific STS trust. Production Vercel only invokes production GET API ARN; Preview invokes stage, not production. Reject invalid source modes or stage/role mismatch without silently switching to an unsafe API target.
- Map current `<stationId>-<measureType>` aliases explicitly to canonical IDs (e.g. `4009-level` → `ea-colwick-level`). Verify unit/datum/identity; don't use station ID alone for level/flow. RDP catalogue is platform-owned; web retains display labels, ordering, grouping and alert eligibility.

## Source modes and rollout
Separate server-side config keys `RDP_TRENT_SOURCE`, `RDP_LEVELS_SOURCE`, `RDP_GAUGE_ALERTS_SOURCE`, each `legacy|shadow|rdp`; absent means `legacy`. These are Vercel environment settings, requiring deployment promotion/redeploy; they are **not** writable HTTP/admin flags. In shadow, legacy is authoritative and optional bounded RDP fetch/comparison never changes the response, subscription, delivery or evaluated alert state. In rdp, only display reads can automatically fall back to validated legacy.

A cutover runbook includes variables/role setup, Preview negative tests, full configuration validation, 48-hour shadow evidence and sampled seven-day history, explicit approval, deployment identity, 900s ISR/cache considerations, monitoring and independent rollback. Production cutover requires normal production RDP writer and read API activation under separate AWS approval; code PRs don't authorise that. A cache can continue serving pre-cutover data briefly; health/source evidence must describe the data actually used, not desired mode.

## Trent dashboard
Build a shared gauge observation adapter that reconstructs existing `stations[].measures[level|flow]` snapshots, `generatedAt`, `fallback`, `partial`, `health` and nested `readings` with value/dateTime from canonical RDP observations. Read history in bounded paginated UTC windows (7 days / up to 672 rows per measurement), reverse RDP chronological ascending into the existing newest-first public response. Preserve existing calculated 1h/1d deltas (currently index 4 / 96), level cm vs flow unit handling and single decimal rounding on this migration; measure missing-sample behaviour separately for future change.

Keep legacy EA read available per complete measurement series (not pointwise), validate each fallback independently for measurement/unit/observedAt/quality and freshness. If a valid fresh legacy series exists when RDP is unavailable/stale, use it and report fallback. If only stale last-known readings exist, optionally return them with **stale** health, never a fresh notification input. One failed measurement must not unnecessarily suppress successful independent measures. Preserve existing public `{ok:true,data}` envelopes and established empty/partial states.

`buildOperationalHealth` currently labels fallback ahead of stale; change precedence or attach independent status so an hours-old fallback cannot masquerade as acceptable fresh data. All fallback output must preserve actual observation age, origin and whether any series is missing.

## Observed levels and forecasts
Use RDP Colwick observations for `level_data`; retain the scraper snapshot as the **separate** legacy forecast source for `forecast_data`. Preserve `/api/levels` shape (`reading_date`, `reading_level`, `forecast_date`, `forecast_reading`) and public envelope; avoid conflating observation freshness with forecast generation age. Fail either component independently, including legacy-fallback processing, and expose backwards-compatible source/health diagnostics. Other predictor/forecast API reads remain unchanged.

## Live gauge alert safety — refined Slice D (31 October 2026)

### Boundary and prerequisite
The merged #51-A/B/C changes supply authenticated RDP reads and display fallback, not an alert-safe reader. Today `runColwickAlerts` still uses the legacy Trent snapshot and Mongo collections `alertSubscriptions`, `alertDeliveries` and `alertRuns`. Its existing hysteresis is 0.03 m for level and 1 m³/s for flow. The stored `lastEvaluatedAt` is evaluator time, **not** proof an observation was processed. The delivery-key index alone does not make concurrent subscription transitions or uncertain sends safe.

Implement **#47 reliability-only first, separately**: establish safe repeated/overlapping runs and consistent delivery/state claims; make incomplete/uncertain sends recoverable or reviewable; retain useful run-failure visibility. The coding agent should choose the smallest robust approach (e.g. conditional writes, a lease or another verified mechanism), not introduce multiple new coordination layers by default. Explicitly provision/verify necessary indexes rather than recreating them per cron invocation. Preserve the current `*/15 * * * *` cron; the five-minute trial is a later independent decision.

### Alert source and freshness
- Select `RDP_GAUGE_ALERTS_SOURCE` once for each run and keep it fixed through retries. `legacy` uses the legacy measurements; `rdp` uses only RDP. `shadow` keeps legacy authoritative and compares RDP independently. Never reuse the display's automatic legacy fallback, in-process last-successful gauge snapshot or 900-second RDP display history cache as an alert decision.
- Use the existing #69 production API contracts: batch latest for per-measurement availability and observed-time freshness; bounded chronological `/observations` history when catch-up is needed; catalogue/health as needed to verify identity and diagnose lag. A successful HTTP or collection run is **not** a fresh reading. Check the latest usable observation age locally: **no more than 30 minutes**, with future/invalid times rejected.
- Verify correct canonical ID, station, level/flow parameter, units and datum, finite value, and acceptable quality. Reuse existing alias/contract validation; inspect real EA/RDP quality representations and fail conservatively on untrusted quality rather than inventing a new quality framework.
- A failed, old or unknown measurement skips **only** affected live gauge rules and never triggers, rearms or advances their condition/observation progress. Keep independent healthy gauge, forecast, HPP and water-quality/CSO rules running. Distinguish source failure from staleness in diagnostics.

### State progression and bounded catch-up
- Preserve existing subscriptions, active/unsubscribed/confirmation status, `lastConditionState`, alert identity, delivery records and idempotency keys. Keep an observation-time progress marker for each live rule (or equivalent durable, conditional state); don't mistake `lastEvaluatedAt` for observed time.
- On first introduction of the progress marker, reconcile against known existing state without generating a crossing or automatically rearming. When the existing state cannot be reconciled with trustworthy observation evidence, hold that rule for review rather than silently overwriting its meaning. Do not enrol pending or unsubscribed rules.
- Evaluate usable newer observations in timestamp order, up to a clearly documented **bounded** lookback/row budget chosen using actual 15-minute cadence and observed lag. Do not require a continuous quarter-hour series where the upstream provider legitimately has gaps. If required history is unavailable/incomplete or a catch-up budget is exceeded, hold that rule rather than inventing a safe crossing or silently skipping unknown state.
- Apply the existing hysteresis exactly. Historical catch-up may establish a clear/rearm and subsequent crossing, but a notification is eligible **only when the latest valid observation remains fresh and the threshold condition is still met**. A transient event already cleared at the newest observation must not cause a late email. Repeated observations, older observations and conflicting revisions at the same timestamp must not recreate transitions.
- For source switch **in either direction**, a newer timestamp alone does not guarantee continuity. Compare equivalent measurements and relevant overlapping timestamps/values, including the stored condition, before accepting any state change. If legacy and RDP disagree or cannot establish continuity, hold affected rules until verifiable evidence or operator-approved reconciliation. Overlapping old/new deployments must not be able to write conflicting transitions. Reuse the #47 concurrency protection wherever possible rather than imposing a separate mandatory epoch/locking subsystem.

### Delivery, shadow and rollback
- The logical threshold transition is the delivery identity; equivalent EA and RDP observations must not create a second delivery merely because source changed. Preserve existing delivery intents and provider idempotency keys, and ensure state updates and delivery claims are crash/retry safe through #47.
- Uncertain provider outcomes retain their original immutable send identity/payload. If the provider's idempotency protection has expired, **hold for operator review**, not an automatic second send. Do not promise exactly-once delivery in irrecoverably ambiguous provider outcomes.
- In `shadow`, legacy remains the sole authoritative evaluator and may perform its normal state writes/emails. The **additional RDP shadow path** must be pure/read-only: no subscriber, delivery, `alertRuns` or progress writes and no emails. Compare observable condition outcomes at matched timestamps, freshness/lag and skipped/mismatched states with non-sensitive diagnostics. Shadow failure must never block legitimate legacy rules.
- Activation is a separately approved future source-setting deployment, following #47 reliability evidence, valid production RDP read access, parity and a reviewed reconciliation plan. Use approximately 48 hours of bounded shadow evidence plus a sampled seven-day comparison and deterministic crossing fixtures; do not rely on naturally occurring crossings.
- To roll back, switch **only** the alert source setting through an approved redeploy; do not modify the Trent/levels display source settings. If legacy observations lag or disagree, the relevant gauge rules are held instead of triggering or rearming; unaffected alert types continue. Retain the old services, subscription/delivery state and a non-sensitive operator reconciliation record. Dashboard 900-second caching does **not** define alert freshness.

### Verification and acceptance checklist
Use deterministic tests for: per-measure partial failures, ID/units/quality and 30-minute boundaries; repeated/overlapping 15-minute runs; out-of-order/replayed/conflicting readings; bounded history and gaps; existing armed/triggered subscriptions with no progress marker; both directions and hysteresis; catch-up that has already cleared versus remains active; uncertain/expired delivery retries; source switches/rollback including overlapping deployments; zero **shadow-side** writes/sends; unaffected forecast/HPP/water/CSO paths.

**Shadow gate**
- [ ] #47 reliability-only prerequisite independently implemented/tested; 15-minute cron unchanged.
- [ ] Alias, quality, freshness and source continuity validated; ~48-hour bounded shadow and sampled 7-day evidence reviewed, with deterministic crossing tests.
- [ ] No unexplained decision differences or RDP-shadow side effects; documented exceptions are explicit.

**Activation gate (not authorised by this OpenSpec)**
- [ ] Approved live production RDP collection, read API and actual Vercel OIDC/IAM evidence for eligible measures.
- [ ] Initial subscription-state reconciliation and held cases reviewed; chosen catch-up bounds and source freshness/lag evidenced.
- [ ] Concurrency, delivery recovery, source-switch and independent alert rollback tests pass; operator approval recorded.

**Rollback gate (tested before activation)**
- [ ] A source-only redeploy cannot replay an old value, spuriously rearm or resend.
- [ ] Disagreeing/newer legacy values hold affected rules; unrelated alerts still run.
- [ ] Delivery/state records persist; operators can diagnose and reconcile held rules without a silent reset.

## Shadow evidence and failure taxonomy
Compare **matching exact observed timestamps** for known identical measurement/unit/datum; exact source decimal within representational precision, no arbitrary tolerances. Independently record lag of newest observation, unmatched timestamps, missing historical periods, source health/stale, 1h/1d derived deltas and mismatched quality. Do not flag different HTTP fetch/completion times as value conflicts. Classify legitimate gaps and direct EA cache differences separately.

Suggested initial dashboard gate: 48h of automated bounded sampling (around operational cadence) plus representative 7d historical fixtures/parity. Require six-series identity/availability, no unexplained timestamp-aligned value mismatch, acceptable freshness and no critical authentication/contract failures. Allow documented provider outages; do not require all #50 history. Shadow alert transitions are tested with controlled threshold-crossing fixtures; do not wait for real conditions.

403/wrong-stage, 429, 5xx, timeout, `no_observations`, per-measure partial latest, stale and `ARCHIVE_INTEGRITY` remain distinguishable in server logs/metrics. Read-only display may present independently verified legacy data on backend error but must not conceal backend integrity problems operationally. No credential or sensitive provider body in logs.

## Verification
Web Jest contract/regression tests for six-series alias mapping, bounded paging, ordering, 365d/month edges via API fixtures, 900s cache, partial/fallback health, stale backoff, separate forecast, client IAM stage failure and single-run alert source pinning. Test alert state transitions, time watermark, hysteresis, missing/unknown, unaffected other rules and no duplicate emails. Run ESLint/Jest/Next.js build. No AWS mutation or public API exposure is implied.
