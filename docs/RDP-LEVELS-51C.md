# RDP observed Colwick levels (#51-C)

Implements section C of [unify-gauge-consumers](../openspec/changes/unify-gauge-consumers/tasks.md)
on top of the [#51-A client](RDP-CLIENT-51A.md) and the [#51-B Trent adapter](RDP-TRENT-51B.md).
The consumer is `/api/levels`. There are two producers: RDP's read API
(`ea-colwick-level`) and the scraper's `levels/latest.json`. The scraper, predictor and RDP
repositories are unchanged. **Every deployed target stays `RDP_LEVELS_SOURCE=legacy`.**
This slice adds no Vercel setting, deployment, AWS change or production cutover.

## Modes

`getLatestLevelsSnapshot()` reads only `RDP_LEVELS_SOURCE`, independently of the
Trent and alerts keys. If it's absent it is `legacy`. An invalid value logs an
error and serves legacy. The default path never imports `libs/rdp/`.

| Mode | `level_data` | `forecast_data` | RDP reads | Side effects |
| --- | --- | --- | --- | --- |
| `legacy` | Scraper snapshot | Scraper snapshot | None | None |
| `shadow` | The legacy result object, unchanged | Scraper snapshot | One bounded Colwick history, concurrent with legacy | One log line per snapshot |
| `rdp` | RDP, else fresh validated scraper series, else stale | Scraper snapshot, always | One bounded Colwick history | Degraded log line |

Only observed `level_data` migrates. `forecast_data`, the predictor forecast APIs,
HPP status, CSO and water quality do not change. Gauge alerts don't read
`/api/levels` (they use the predictor forecast and `getLegacyTrentWeirsSnapshot()`),
so no levels mode changes alert inputs. The admin operational-health `levels`
check uses the display path, so it reports what `/api/levels` serves.

## Contract preservation

- **Envelope:** `{ok:true,data:{level_data,forecast_data,health}}`. The route, its
  `revalidate = 900` and its empty `unavailable` payload are unchanged.
- **`level_data`:** `[{reading_date, reading_level}]`, newest first, in EA `dateTime`
  format (`…:00Z`), in metres (mASD, as the scraper's EA 4009 feed). The depth is the newest 480
  readings (5 days), matching the scraper's default `READINGS_LIMIT`. A test
  asserts that identical source data gives `level_data` deep-equal to legacy.
- **`forecast_data`:** passed through from the scraper snapshot exactly as in
  legacy mode. No forecast values are made up: if the snapshot fails, it is `[]`.
- **Health (rdp mode only, additive):** top-level `health` keeps its fields and
  describes **observed levels**. `source` is `river-data-platform-levels`,
  `generatedAt` is the newest served observation, and `state` is
  `fresh|fallback|stale|unavailable`. Two fields are added:
  - `health.observed`: `{origin: rdp|legacy|cache|null, state, observedAt, ageSeconds}`
  - `health.forecast`: standard health for the scraper forecast. Its age comes from
    the snapshot's `model_date`, never from forecast dates, which are in the future.

  Legacy mode's health is unchanged. Note that its `generatedAt` includes future
  forecast dates, so it is not a measure of observation age; rdp mode keeps the two apart.
  RDP error codes are only logged server-side, never returned.

## Shared RDP helpers (coordination with #51-B)

The only change to #51-B code is that `readRdpSeries` in `libs/rdp/trentSource.js` is
now exported. Its behaviour is unchanged. Levels reuse it, so they also reuse:

- the same `unstable_cache(["rdp-trent-history-v1"], {revalidate: 900})` entry. The
  Trent dashboard and `/api/levels` therefore share one `ea-colwick-level` history
  read per 900s window, and the route stays `○ 15m` (see #51-B's Caching notes).
- the bounded 7-day / at most 3-page pagination, strict ordering, identity, unit, datum and
  page-integrity validation, and the 10s per-series deadline.
- `compareTrentSeries` for the shadow report, and `isSeriesFresh`, which uses the
  30-minute baseline.

## Display fallback and honest health

In rdp mode, the RDP read and the scraper snapshot fetch run concurrently.
The snapshot fetch uses the same 900s fetch cache as legacy. Each one fails
independently, and neither can reject the other. Selection is per complete series,
and RDP and scraper points are never mixed:

1. Use a fresh RDP series (newest observation ≤ 30 minutes old).
2. Otherwise accept the scraper's `level_readings` only if the whole array is valid:
   it is non-empty, every `reading_level` is a finite number, every `reading_date` parses,
   and times strictly descend. Use it if it's fresh; `state` is then `fallback`.
   The snapshot has no per-row measure ID, so its identity depends on the scraper's
   fixed station 4009 feed.
3. Otherwise serve the newest of stale RDP, stale scraper or this instance's
   last-known series (`cache`), reported `stale`. `buildOperationalHealth` ranks
   stale above fallback, so old data can never show as acceptable fallback.
4. If there is no series, `level_data` is `[]` and observed health is `unavailable`,
   while a valid forecast is still served. If both parts are unavailable, the service
   throws and the route returns its existing empty `unavailable` payload.

If the forecast fails while observations are healthy, the response keeps
`level_data`, sets `forecast_data: []`, and reports
`health.forecast.state: "unavailable"`. Top-level observed health is not affected.

## Shadow comparison

The legacy result is returned as-is, and a legacy failure is rethrown exactly as
in legacy mode. The RDP read cannot reject. `compareTrentSeries` compares the 480
scraper readings with the RDP 7-day history **only at exactly equal observed
timestamps**, using representational equality. Gaps are counted only inside the
overlap, so the 5-day versus 7-day window edge isn't counted as a gap.
Newest-observation lag, the RDP error code and the 1h/1d rates are reported separately.
Fetch-time differences are never conflicts.

Log line: `[…] [GET] [rdp/levels-shadow] RDP levels shadow comparison {comparedAt, legacyState, series}`.

### Shadow review (gate before any `rdp` activation; not yet run)

Prerequisites: #69 is live, Preview function-runtime federation is proven (#51-A),
and the activation is approved.

1. Get approval for a Preview deployment with `RDP_LEVELS_SOURCE=shadow`. Record
   the deployment ID and SHA.
2. Over at least 48h, export the shadow lines. Require `value_mismatch` = 0 with no
   unexplained cause, typical `latestLagSeconds` ≤ 900 and no
   `AUTHORIZATION_FAILED|AUTHENTICATION_FAILED|RESPONSE_CONTRACT_ERROR|ARCHIVE_INTEGRITY`.
   Classify `gaps` (EA outage, scraper miss, RDP ingest gap) as documented exceptions.
   Check the snapshot's `level_source` before treating a mismatch or gap as an
   RDP fault. `flood-api` is the same EA feed. `gauge-page-fallback` is the gov.uk
   gauge page, and `s3-fallback|mongo-fallback` re-serve the scraper's earlier history.
3. Attach the summary to #51.

## Activation and rollback (approval-gated)

The order stays Trent → observed levels → gauge alerts. To activate, an operator
changes the Production `RDP_LEVELS_SOURCE` and redeploys; that needs a separate
production RDP approval. To roll back, set it to `legacy` and redeploy. Expect up
to about 900s of previously cached `/api/levels` responses, plus up to 900s of
shared RDP history data cache. The scraper fetch cache stays warm in rdp mode
because the forecast always reads it. Rollback is tested: legacy mode never
calls the client, serves the legacy result exactly, and doesn't hide a scraper
outage behind earlier RDP data. Other consumers are untouched.

## Evidence

Local, 27 October 2026:
- 31 new tests in `__tests__/rdpLevels.test.js` passed, and the full Jest run passed (46 suites, 315 tests).
- ESLint showed 0 errors and the 9 existing warnings.
- `next build` passed with the CI dummy settings, both as default and with
  `RDP_LEVELS_SOURCE=rdp`. In rdp mode there is no Vercel env, so the build fails
  closed with `CONFIGURATION_ERROR`, and with no S3 URL the route serves its empty payload.
  Both builds listed `/api/levels` and `/api/trentweirs` as `○ 15m`.

Not claimed: live RDP reads, function-runtime federation, shadow parity or rollback in a real deployment.
