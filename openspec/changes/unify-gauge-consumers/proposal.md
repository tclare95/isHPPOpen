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

## Capabilities
### New
- `rdp-web-consumers`: authenticated client, per-consumer source selection, shadow parity, safe display fallback and conservative alert cutover.

## Dependencies and ownership
Web implementation: `tclare95/isHPPOpen`; planning here. Backend #69 owns .NET read Lambda, IAM endpoint and Dynamo/S3 querying. #52 ensures all six existing measurements are configured; #50 supplies useful verified historic coverage, but **complete multi-year reconstruction is not a prerequisite** to seven-day display cutover. #75 separately governs stage approval and any AWS deployment.

## Non-goals
No new RDP public/developer API, playground, backend query Lambda, old Node scraper refactor, new forecasting model, site-status event migration, alert-delivery rewrite, UI redesign or runtime admin feature-flag service.

## Release and rollback
Documentation only. Future implementation delivered as independently reviewable PRs: (A) client/aliases, (B) Trent, (C) observed levels, (D) gauge alerts. Production selections remain legacy until explicit deployment configuration changes and shadow evidence is reviewed. Rollback uses per-consumer Vercel variable + redeploy, checks 15-minute public cache propagation and verifies alerts against unchanged state. Never stop legacy services as a consequence of this change.
