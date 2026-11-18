# Admin operational overview

Part of [Wave B product operations](../openspec/changes/wave-b-product-operations/specs/admin-operational-oversight/spec.md)
("Actionable administration overview"). `/admin` is the operator's starting point: problems first, then each
scheduled job and live source separately.

## What the page shows

1. **Needs attention**: only components that are not healthy, most severe first, each with its first reason, the
   evidence time and links to an existing diagnostic or runbook section. Components that are intentionally off
   (for example in-app HPP evaluation in `legacy` mode, or gauge inputs when no live gauge alert exists) are listed
   once as "not checked because they are not enabled", not as problems. There is no combined all-clear badge.
2. **Scheduled jobs and the inputs they recorded**: one card per component from `GET /api/admin/operational-overview`.
3. **Live source checks**: the unchanged `GET /api/admin/operational-health` result, mapped to the same four states
   (`fresh` → healthy; `fallback`/`stale` → degraded; `unavailable` → unavailable; no result → unknown). The raw
   source state stays visible.

The record view refreshes every 5 minutes; live source checks run when the page loads (as before). If either request fails, the page lists it under Needs attention as unknown.

## States

| State | Meaning |
| --- | --- |
| `healthy` | Recent positive evidence and no recorded problem. |
| `degraded` | A recorded problem, a held operation or evidence older than the job's schedule allows. |
| `unavailable` | The job recorded a failure that stopped it (for example an alert run `failed`). |
| `unknown` | Not checked: never run, no record, evidence too old to describe inputs, or the read failed. Never healthy. |

## Components and the records they read

`GET /api/admin/operational-overview` (admin-only via `requireRouteAdmin()`, `Cache-Control: no-store`) returns
`{ checkedAt, components: [{ key, label, state, attention, summary, evidenceAt, reasons: [{ category, state, message }], facts: [{ label, value, kind }], links }] }`.
Each read is independent: a failed read makes only its components `unknown` (`evidence_read_failed`), and a database
outage returns every component as `unknown` rather than an error.

| Component | Records read (all bounded) | Notable reasons |
| --- | --- | --- |
| HPP status evaluation (`hppEvaluation`) | `hppWriterControl/openIndicator` (owner), `hpp-colwick` in `hppShadowState` or, when authoritative and the control names the app, `hppStatusState` (`_id` lookups); newest valid `openIndicator` record (the public reader's query) | `never_run`, `stale_run` (> 45 min), `hold:<reason>` (review-class holds say so), `source_error:<code>`, `writer_mismatch`, `invalid_config` |
| Alert evaluation (`alertEvaluation`) | newest 20 `alertRuns` by `_id` (default index), whitelisted fields only | `never_run`, `stale_run` (> 45 min), `run_failed:<category>` (unavailable), `run_incomplete`, `run_interrupted`, `source:<input>`, `rule_errors`, `gauge_held` |
| Alert delivery (`alertDelivery`) | the same runs: the collection-wide `outstandingDeliveries` and `deliveryIndex` the latest evaluating run recorded, and sent/failed counts summed over the window | `held_for_review`, `stale_claims`, `uncertain_sends`, `delivery_index_missing`, `recent_send_failures`, `evidence_stale` |
| Observed levels used by alerts (`alertGaugeInputs`) | the run's `gaugeSources` | `gauge:<key>` (stale/error/no observations), `invalid_config` |
| Forecast used by alerts (`alertForecastInput`) | the run's `sourceFailures` | `forecast_unusable` |
| CSO and water quality (`waterQuality`) | newest `waterQuality` summary (indexed `scrape_timestamp`) via the existing summary reader; `RDP_CSO_SOURCE`, `RDP_WQ_ASSESSMENT`, `RDP_CSO_MEMBERSHIP`; the run's water-quality failures and RDP assessment diagnostics | `summary_stale` (information only when all three settings are `rdp`), `summary_missing`, `alert_input:<input>`, `invalid_config:<name>` |

Run-derived input components use the newest `success`/`degraded` run; if it is older than 45 minutes they are
`unknown` rather than repeating old evidence. A run marked `degraded` only for delivery reasons leaves Alert
evaluation healthy and is reported under Alert delivery, so independent problems stay separate.

## Boundaries

- Read-only: no writes, no job or cron trigger, no alert replay, no provider or RDP call. `alertSubscriptions` and
  `alertDeliveries` are not read; counts come from what each run already recorded.
- No subscriber emails, tokens, idempotency keys, credentials or raw provider errors leave the service: run fields are
  projected to a whitelist and every recorded code is passed through `safeCategory()` (anything that is not a short
  identifier becomes `other`). Alert figures are aggregate counts.
- `/api/admin/operational-health` keeps its documented response contract.
- Forecast model accuracy is not recorded by the app; the card links to `/forecastinfo` instead.
