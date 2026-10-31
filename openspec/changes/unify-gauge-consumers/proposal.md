# Proposal: Reversible isHPPOpen migration to RDP gauge readers (#51)

## Why
isHPPOpen currently fetches the Trent dashboard's six series directly from EA, observed Colwick readings plus government-page forecast from scraper S3 `levels/latest.json`, and live gauge alert inputs via the Trent service. RDP's first-party read API [#69](https://github.com/tclare95/isHPPOpen/issues/69) should replace **gauge reads** without coupling web releases to Dynamo/S3 internals, regressing public route contracts or affecting notification safety.

## Accepted decisions (20 October 2026)
- Migrate in strict order: **Trent dashboard → observed levels → live gauge alerts**.
- Use the existing internal read API with short-lived **Vercel OIDC → STS → SigV4** server-only credentials, separate Preview→stage and Production→production roles/API settings. No browser AWS token, static key or anonymous RDP access.
- Each consumer independently chooses **`legacy`, `shadow` or `rdp`** by validated Vercel **server-side environment configuration**, not a new dynamic flag service or admin UI. The initial/default mode is legacy; an explicit redeploy activates/rolls back each selection.
- In RDP mode, read-only displays may automatically fall back to independently validated **fresh** legacy readings **per complete measurement series**; stale last-known fallback may still be displayed only as stale. The system MUST NOT silently stitch individual readings from different sources into one series.
- Gauge alerts use their configured source exclusively in a given evaluation and **do not automatically fall back** after RDP failure. Skip only affected rules, never trigger/rearm on missing/stale/unknown data or on source switch/replay. Separate manual rollback to legacy remains possible.
- Shadow comparison is read-only, bounded and side-effect free; use matching observed UTC timestamps rather than snapshot indices or fetch/completion timestamps. Start with 48 hours of routine comparisons and sampled seven-day history, with documented exceptions rather than artificial perfect parity.
- Preserve `/api/trentweirs` six-series snapshot, newest-first order, existing index-based 1h/1d change calculations, 900s operational cache baseline and 30-minute stale-data threshold. Any later change to missing-sample rate calculations is separate and must be explicitly tested.
- Preserve `/api/levels` `level_data` and `forecast_data` separately: only observed readings migrate now. Forecast source, HPP transition Mongo state, CSO and water quality stay independent.
- Existing 15-minute response caching must be accounted for during cutover/rollback, with verified deployment identity and source/health evidence.

## Accepted Slice D decisions (31 October 2026)
- **Dependency:** implement the reliability-only work in [#47](https://github.com/tclare95/isHPPOpen/issues/47) as an independent, reviewed prerequisite. Do not bring its optional five-minute cron experiment into #51; keep the existing 15-minute cron.
- **Existing subscriptions:** preserve status, armed/triggered condition, keys and delivery history. Establish observation progress only with trustworthy evidence; hold ambiguous subscriptions rather than automatically reset/rearm them.
- **Late observations:** use a bounded chronological catch-up. Send only when the latest eligible fresh observation still meets the condition; do not send a notification for a historical excursion that has already cleared.
- **Freshness:** latest actionable source reading must be no more than 30 minutes old by its own observed timestamp. Record actual source/ingestion/evaluation lag separately.
- **Source changes and rollback:** hold rules when continuity between legacy and RDP is not proven, until continuity is established or an operator approves reconciliation. No automatic alert-time legacy fallback.
- **Uncertain delivery:** preserve the delivery's original idempotency identity and do not blindly retry after the provider's idempotency protection expires; escalate to operator review.

These are behavioural requirements, **not** approval to implement, deploy, change configuration, or send notifications. The implementation may use the simplest concurrency/state mechanism that demonstrably satisfies the existing contracts and tests.

## Capabilities
### New
- `rdp-web-consumers`: authenticated client, per-consumer source selection, shadow parity, safe display fallback and conservative alert cutover.

## Dependencies and ownership
Web implementation: `tclare95/isHPPOpen`; planning here. Backend #69 owns .NET read Lambda, IAM endpoint and Dynamo/S3 querying. #52 ensures all six existing measurements are configured; #50 supplies useful verified historic coverage, but **complete multi-year reconstruction is not a prerequisite** to seven-day display cutover. #75 separately governs stage approval and any AWS deployment.

## Non-goals
No new RDP public/developer API, playground, backend query Lambda, old Node scraper refactor, forecasting model, site-status event migration, general-purpose notification platform, UI redesign or runtime admin feature-flag service. The separate #47 reliability work addresses existing delivery safety.

## Release and rollback
Documentation only. Slices A/B/C are merged (#80/#84/#85). Remaining Slice D follows a separate #47 reliability-only PR and may be broken into reviewable implementation pieces as appropriate. Production selections remain legacy until explicit deployment configuration changes and shadow evidence is reviewed. Display rollback uses per-consumer Vercel variable + redeploy and checks 15-minute public cache propagation. Alert rollback additionally verifies source continuity and retains existing subscription/delivery state; a config switch must not fabricate crossings. Never stop legacy services as a consequence of this change.
