# RDP gauge display activation record (#51)

This is the operational record for moving the read-only gauge displays (`/api/levels`, `/api/trentweirs`)
to RDP. It sits on top of [#51-B](RDP-TRENT-51B.md) and [#51-C](RDP-LEVELS-51C.md) and does not change
their adapters. Gauge alerts ([#51-D](RDP-GAUGE-ALERTS-51D.md)) are assessed separately below and are
**never** switched together with a display.

## Deployed state (read-only inspection, 2026-11-12 23:45Z – 2026-11-13 03:20Z)

How this was established: `vercel env ls` (names and targets only; values are sensitive), production
deployment metadata, the public route responses and Production runtime logs. Nothing was inferred from
repository defaults.

| Item | Observed |
| --- | --- |
| Production deployment | `dpl_4AcHYTLdWqhUYjS8t7BoTZK5nqar`, `main` @ `c7a404d` (#123), Git-triggered 2026-11-12 23:32Z, aliased to `ishppopen.co.uk` |
| Production RDP entries | `RDP_AWS_REGION`, `RDP_API_URL`, `RDP_ROLE_ARN`, `RDP_LEVELS_SOURCE`, `RDP_GAUGE_ALERTS_SOURCE`, `HPP_STATUS_SOURCE` (Production only, sensitive). **No `RDP_TRENT_SOURCE`.** Preview/Development have no RDP entries. |
| `RDP_TRENT_SOURCE` | absent → `legacy`. `/api/trentweirs` health source `environment-agency-trent`; no `rdp/trent-shadow` log line ever. |
| `RDP_LEVELS_SOURCE` | effectively `shadow`. `/api/levels` serves legacy (`scraper-levels`), and `[rdp/levels-shadow]` lines run continuously from 2026-11-03 11:17Z (first Production federation, #81 P7). |
| `RDP_GAUGE_ALERTS_SOURCE` | effectively `shadow`. `[alerts/gauge-shadow]` lines on every 15-minute cron run from 2026-11-03 12:15Z. |
| Signed RDP access | Vercel Production OIDC → `river-data-platform-production-vercel-production` → `o48ys6okea/production`, proven on #81 (CloudTrail, 2026-11-03) and in use: 909/909 gauge shadow reads `completed`, 98/98 levels shadow reads without an RDP error. |
| RDP collection | Six IDs selected in Production (P5 applied in run 42045246124; managed selection v1 since apply 42306290248, same six). See RDP `docs/COLLECTION-SELECTION.md`. The "P5 pending" wording on #52/#81 is out of date. |

## Data parity evidence

Reproduce it with `npm run rdp:shadow-review` (below). Window: 2026-11-03 → 2026-11-12, about 227 h.

**Colwick observed levels: RDP vs. legacy scraper (Production shadow).** 98 comparisons: 0 value
mismatches, 0 RDP errors, median newest-observation lag 0 s (max 900 s, 5 cases of ±900 s at a publication
boundary). Statuses: 58 `match`, 35 `lag`, 5 `gaps`. **Explanation of the 35 `lag`s:** they all have
`latestLagSeconds: 0` and only ~340–361 of 480 instants matched, with no gaps. The scraper's
`mergeLevelHistory` (`ishppopenScraper/is-hpp-open-scraper/is-hpp-open/app.mjs`) de-duplicates by the raw
`reading_date` string. After a gauge-page fallback, the same instant is kept twice (`…T17:30Z` and
`…T17:30:00Z`) until the next full-history refresh, which shifts the index-based 1-day rate. This is a
**legacy** defect. The comparator now reports it as `duplicate_instants`, with `legacyDuplicates`, and keeps
`lag` for real lag. RDP's `rdp` mode already rejects such a scraper series as fallback
(`validateLegacyLevels`) and never serves duplicates. The 5 `gaps` (11 Nov, `missingInRdp: 1`) are
legacy-only instants: direct EA has no reading in November that RDP lacks (below).

**Colwick: RDP Production vs. direct EA.** Source: the public `/api/history/colwick/month` (an RDP
Production read) against `flood-monitoring/id/measures/4009-level-stage-i-15_min-mASD/readings`, for
2026-11-01 00:15Z → 2026-11-13 02:45Z: **1,161 exact-timestamp matches, 0 value mismatches, 0 missing on
either side.** In the same window the legacy snapshot lacked 11 Nov 03:45Z, which both EA and RDP have.

**Colwick: alert-safe reads (Production gauge shadow).** 909 runs: 0 value mismatches, 0 legacy-only and
0 RDP-only instants, 909/909 decisions agreed, 26 runs with non-zero newest lag.

**Other five Trent series (Clifton Bridge, Shardlow level/flow, Church Wilne, Kegworth).** There is **no
Production RDP comparison yet.** No Production code path reads them (`RDP_TRENT_SOURCE` was never set),
and the read API is reachable only through the Vercel Production identity. Fixture parity, including
partial publication and an EA-lagging flow series, is in `__tests__/rdpTrent.test.js`.

**Freshness, display side.** In shadow mode RDP and legacy had the **same** freshness (RDP adds no lag).
Both were older than the 30-minute limit at ~59 % of comparisons (median observation age 32 min, p90 42 min).
That comes from EA's own publication delay. On 2026-11-12 23:52Z five series were 23 min old and Shardlow flow was 38 min.

## Freshness behaviour after activation (understandable, not hidden)

- The 15-minute route cache (`revalidate = 900`, `○ 15m` in both build modes) and the 900 s RDP history data
  cache are unchanged, so the worst-case response age is still about 30 minutes, as in legacy.
- `/api/levels`: top-level `health` describes observations; `health.observed` and `health.forecast` sit
  beside it. No UI badge reads it; the pages show the reading time itself. Legacy health was always
  `fresh` because its `generatedAt` was a future forecast date. In `rdp` mode it is honest and will often be `stale`.
- `/api/trentweirs`: in `rdp` mode the **oldest** served series sets `health.ageSeconds`, so a late
  Shardlow flow or Church Wilne makes the snapshot `stale`. That is honest, but the dashboard badge will
  show "Data may be stale" more often than legacy, whose age came from the **newest** series.
- The dashboard badge now re-checks `generatedAt` (an observed time for Trent in both modes) when the page
  renders. A cached `fresh` or `fallback` response whose observation is now over 30 minutes old shows as
  stale (`getDisplayedHealthState`), so the cache never shows old data as "Updated". This also applies in
  legacy mode, and only to the Trent badge.

## Executable read-only review

```sh
# From a directory linked to the project (vercel link --project is-hpp-open), logged in to Vercel:
npm run rdp:shadow-review -- --fetch --since 2026-11-03T00:00:00Z --cwd <linked-dir>
# or from saved `vercel logs --json` exports, plus the public Colwick RDP-vs-EA check:
npm run rdp:shadow-review -- exports/*.jsonl --colwick-ea https://ishppopen.co.uk
```

It reads only fixed shadow report lines and public endpoints, and it changes nothing. It applies the
documented gates: ≥48 h, 0 value mismatches, no `AUTHENTICATION_FAILED|AUTHORIZATION_FAILED|RESPONSE_CONTRACT_ERROR|ARCHIVE_INTEGRITY`,
RDP available in most comparisons, median lag ≤900 s, every expected series present. It lists gaps and
legacy duplicates for classification. Exit code 1 means a gate failed. `vercel logs` returns at most 50
rows per query, so `--fetch` pages in 3-hour windows. Result on 2026-11-13: levels **pass**, Trent
**blocked** (no comparisons), gauge alerts **blocked** (see below), Colwick vs. EA **match**.

## Release and rollback

The baseline for both steps is `dpl_4AcHYTLdWqhUYjS8t7BoTZK5nqar` (`c7a404d`), unless a later merge has
replaced it. Record the actual deployment ID before each change. Merging `main` deploys Production on its own,
so merge any pending PR first and record that deployment as the baseline.

### Step 1: observed levels, `RDP_LEVELS_SOURCE=rdp` (gate met; needs separate owner approval)

1. Change only this value: `vercel env update RDP_LEVELS_SOURCE production` → `rdp` (it stays sensitive).
   No other variable changes.
2. Re-list Production deployments, then redeploy the newest `main` build: `vercel redeploy <current Production deployment> --target production`. Record the new
   deployment ID, its commit and READY.
3. Verify after the build has prerendered:
   - `/api/levels` → `health.source = river-data-platform-levels` and `health.observed.origin = rdp`
     (or `legacy`/`cache` only with matching state)
   - `level_data` has 480 strictly descending rows equal to direct EA at the same instants
   - `forecast_data` deep-equals the scraper's `forecast_readings` and `health.forecast` is derived from `model_date`
   - `Cache-Control`/ISR behaviour is unchanged
   - logs show only `rdp/levels` "display degraded" lines that are explained by staleness
   - `/api/trentweirs` and alerts are unchanged
4. Roll back by setting `RDP_LEVELS_SOURCE=shadow` (the previous value) and redeploying the current Production
   deployment. Use `vercel rollback` only as an emergency stop: it also reverts any later code or other flags,
   and it stops Git pushes from being assigned to Production until it is undone or promoted. Expect up to ~900 s of cached rdp responses plus up to 900 s of data cache.

**Performed on 2026-11-13, with owner approval for "levels rdp + Trent shadow" in one redeploy:**

| Item | Value |
| --- | --- |
| Baseline (rollback target) | `dpl_4AcHYTLdWqhUYjS8t7BoTZK5nqar`, `c7a404d`, levels `shadow`, Trent absent (legacy), alerts `shadow` |
| Changes | `RDP_LEVELS_SOURCE` `shadow` → `rdp` (`vercel env update`, sensitive); `RDP_TRENT_SOURCE=shadow` added (sensitive). Production only. Nothing else changed. |
| Release | `vercel redeploy dpl_4AcH… --target production` → `dpl_7iANfmcFFte9KRD48pNhoKCqkv2C`, same commit `c7a404d`, READY ~09:30Z, aliased `ishppopen.co.uk` |
| `/api/levels` (09:30Z, prerender) | `health.source = river-data-platform-levels`, `observed.origin = rdp`. It reported `stale` (1,817 s: the newest EA reading, 09:00Z, was 30 min old; legacy Trent was equally stale). 480 strictly descending `…:00Z` rows, **480/480 equal to direct EA**. `forecast_data` has 145 rows, and `health.forecast` is derived from the scraper `model_date` 09:22:23Z (`fresh`). Static `○ 15m` ISR (`X-Vercel-Cache: PRERENDER`) unchanged. |
| `/api/trentweirs` | still legacy (`environment-agency-trent`), as intended for shadow |
| **Overlap incident** | The #124 merge's Git deployment `dpl_7hUDJdYvii1nrrx9EDXypAtqUgqj` (`20d105a`) was created at 09:29:08Z, while this redeploy of `c7a404d` was being started (09:29:20Z). The redeploy took the alias 12 s later and served **pre-#124 code until 09:34:10Z (~5 min)**. The #121 session caught it and redeployed `20d105a`. Lesson: re-list Production deployments *immediately* before a CLI redeploy, and redeploy the newest `main` build, never a recorded baseline that may be stale. |
| Current Production | `dpl_EL3ZdkMGrCGAnUEbv9VtxX3Hfn8c` (`20d105a`, 09:34:10Z) with `RDP_LEVELS_SOURCE=rdp`, `RDP_TRENT_SOURCE=shadow`, `RDP_GAUGE_ALERTS_SOURCE` unchanged (`shadow`) and #121's `RDP_CSO_HISTORY=on`. #124 changed `libs/rdp/client.js` only additively (CSO event routes). `/api/levels` re-verified as `rdp`. |
| Rollback | Restore `RDP_LEVELS_SOURCE=shadow` and/or remove `RDP_TRENT_SOURCE`, then `vercel redeploy` the **current** Production deployment. **Do not use `vercel rollback`**: older deployments carry their own env snapshots and older code, so it would revert #124 and `RDP_CSO_HISTORY` too. |

**First Production Trent shadow comparison** (`dpl_EL3Z`, 2026-11-13 09:51Z): all six series compared, **0 value
mismatches, 0 gaps** (667–669 exact-timestamp matches each), but **RDP is 900–1,800 s behind direct EA on every
series**. Colwick, Clifton Bridge and Kegworth are 900 s behind; Shardlow level/flow and Church Wilne are 1,800 s.
Legacy Trent reads EA directly, while RDP sees a reading only after its 15-minute collector tick plus the 900 s
display history cache. Observed levels showed 0 s lag because the scraper legacy has the same collector-style
delay. This is one sample, not a review. If it persists, `rdp` mode will often find RDP non-fresh and fall back
to legacy EA per series, so the 48 h review must quantify median lag and fallback rate before step 3.

### Step 2: Trent dashboard (blocked until a Production shadow passes)

1. With separate approval, add `RDP_TRENT_SOURCE=shadow` (Production, sensitive) and redeploy. This step is
   display-neutral, because legacy stays authoritative. It adds at most 6 RDP reads per 900 s window, sharing
   Colwick's cached read with levels.
2. After ≥48 h, run `npm run rdp:shadow-review`. The Trent gate must pass for all six series. Classify
   gaps (EA outage, RDP ingest gap, cache difference) and Shardlow-flow and Church Wilne publication lag.
3. With separate approval, `vercel env update RDP_TRENT_SOURCE production` → `rdp`, then redeploy and verify:
   - `/api/trentweirs` → `health.source = river-data-platform-trent`, all six `health.series[].origin = rdp`
   - station order, `level`/`flow` keys, 672 readings and 1h/1d rates are equal to legacy at the same instants
   - stale series are reported stale, never fresh
4. Roll back by setting it to `shadow` or `legacy` and redeploying, or with `vercel rollback`, as in step 1.

## Gauge alerts: `RDP_GAUGE_ALERTS_SOURCE`

`shadow` is **already deployed** and working: 909 runs, data identical, 909/909 decisions agreed, no
subscriber writes from the RDP side. It is **not ready** for `rdp`, and the blocker is not RDP:

- **The newest observation is almost never inside the 30-minute alert freshness limit.** The cron fires at
  :00/:15/:30/:45 plus ~10 s. EA publishes each quarter-hour reading about 19–35 min late, so at run time
  the newest reading is usually **30 min plus a few seconds** old (829/909 runs). RDP status was `stale` in
  909/909 runs and legacy in 632/909. The other 277 legacy runs failed, mostly on the 10 s `TIMEOUT` reading EA.
  So live gauge rules are being **skipped as stale on essentially every run, in the current authoritative
  legacy mode too.** This is an alert-safety finding for the owner. It needs a decision on the accepted
  30-minute observed-time bound or the cron offset. It is not part of display activation.
- An `rdp` switch would remove the legacy timeout failures but not the staleness. Do not switch until the
  freshness decision is made and a shadow review shows RDP `fresh` on most runs (`evaluateGaugeShadow`).
