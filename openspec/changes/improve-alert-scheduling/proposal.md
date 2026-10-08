# Proposal: Improve operational alert scheduling and reliability

## Why

The web application currently evaluates email alerts every 15 minutes via Vercel Cron, while a number of upstream feeds are also collected or refreshed on their own schedules. Vercel Pro permits a more frequent schedule, but a faster cron does not necessarily mean faster observations. The existing evaluator records runs and deduplicates deliveries by transition; we need to verify this remains safe with overlapping invocations, retries, stale inputs and uncertain email outcomes before increasing frequency.

## What Changes

- Baseline source freshness, evaluator duration, scheduled-run health, notification latency and current delivery-claim behaviour.
- Harden repeat/overlap handling and idempotent alert state transitions. Diagnose stuck `claimed` deliveries and failures instead of blindly resending or silently suppressing them.
- Ensure stale/unavailable sources never generate new threshold notifications or incorrect re-arming; keep per-source failures from preventing evaluation of healthy sources.
- Trial five-minute evaluation **only after** reliability checks pass, and retain a documented, low-risk rollback to the current 15-minute cadence.
- Record useful run status, failure counts and end-to-end freshness/latency evidence without exposing subscriber details.

## Capabilities

### New Capabilities

- `operational-alert-evaluation`: Document and improve the existing evaluator's trigger safety, run health and subscription transition behaviour.

### Modified Capabilities

None in the OpenSpec registry; there is no existing canonical alert-evaluation capability spec.

## Impact

**Repository:** `tclare95/isHPPOpen` only; candidate paths `vercel.json`, `app/api/internal/alerts/run/route.js`, `libs/services/colwickAlertsService.js`, operational-health observability, and focused tests.

**Contracts:** Preserve the authenticated cron endpoint, alert subscription and email semantics, and existing source APIs. No changes to the scraper's 15-minute AWS schedule, the predictor's hourly schedule, user-selected alert thresholds, or email-provider configuration.

**Release:** Production Vercel deployments may occur on web-main merge. Roll the schedule back to 15 minutes promptly if duplicates, latency, volume, source freshness or provider limits regress. Never run live cron or send production emails during tests.

**Tracking:** [Issue #47](https://github.com/tclare95/isHPPOpen/issues/47).

## Non-goals

No general push notifications, new alert types, replatforming the scheduler, changing ingestion frequency, database migration, wider email-service replacement or guaranteeing that upstream observations arrive more frequently.
