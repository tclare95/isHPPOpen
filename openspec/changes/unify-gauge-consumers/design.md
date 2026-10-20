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

## Live gauge alert safety
The current `colwickAlertsService` consumes `getTrentWeirsSnapshot()` alongside forecast, HPP, water and CSO signals; `usable` requires `health.state=fresh`, and live threshold hysteresis is 0.03m level / 1 m3/s flow. `sendOnce` records source observation time and value in its delivery transition identity. This implementation is stateful and should not be rewritten as a side effect.

Give gauge alerts an **alert-safe** gauge reader that deliberately bypasses read-only display fallback and in-process stale snapshot fallback. Lock source choice per evaluator run (including after retries), use per-measure validity/age rather than whole-dashboard health to avoid blocking healthy peers, retain existing Mongo subscriptions/delivery/rearming/idempotency. On unavailable, stale, old or unknown reading, skip only that gauge rule; leave its `lastConditionState` untouched. HPP, water-quality, CSO and forecast rules must continue independently.

A source switch or manual rollback must not be interpreted as a fresh threshold crossing or rearm: compare incoming observedAt with a persisted per-rule watermark/last successfully evaluated observation, reconcile existing `lastConditionState` and guard against reusing older snapshots. The same source reading must not send twice after retries, switching or redeployment. Shadow mode computes alert conditions but MUST NOT invoke email send, mutate subscriptions/alertRuns/delivery state or call the normal side-effecting evaluator in a way that writes. A failed shadow read must never break the authoritative legacy evaluation.

## Shadow evidence and failure taxonomy
Compare **matching exact observed timestamps** for known identical measurement/unit/datum; exact source decimal within representational precision, no arbitrary tolerances. Independently record lag of newest observation, unmatched timestamps, missing historical periods, source health/stale, 1h/1d derived deltas and mismatched quality. Do not flag different HTTP fetch/completion times as value conflicts. Classify legitimate gaps and direct EA cache differences separately.

Suggested initial dashboard gate: 48h of automated bounded sampling (around operational cadence) plus representative 7d historical fixtures/parity. Require six-series identity/availability, no unexplained timestamp-aligned value mismatch, acceptable freshness and no critical authentication/contract failures. Allow documented provider outages; do not require all #50 history. Shadow alert transitions are tested with controlled threshold-crossing fixtures; do not wait for real conditions.

403/wrong-stage, 429, 5xx, timeout, `no_observations`, per-measure partial latest, stale and `ARCHIVE_INTEGRITY` remain distinguishable in server logs/metrics. Read-only display may present independently verified legacy data on backend error but must not conceal backend integrity problems operationally. No credential or sensitive provider body in logs.

## Verification
Web Jest contract/regression tests for six-series alias mapping, bounded paging, ordering, 365d/month edges via API fixtures, 900s cache, partial/fallback health, stale backoff, separate forecast, client IAM stage failure and single-run alert source pinning. Test alert state transitions, time watermark, hysteresis, missing/unknown, unaffected other rules and no duplicate emails. Run ESLint/Jest/Next.js build. No AWS mutation or public API exposure is implied.
