# RDP observed Colwick levels (#51-C)

> **Updated 13 November 2026 for [#90](https://github.com/tclare95/isHPPOpen/issues/90)** ([FORECAST-ML-PRIMARY-90](FORECAST-ML-PRIMARY-90.md)): the government forecast is retired, `forecast_data` is always `[]`, and no mode reads the scraper's `levels/latest.json`. The display fallback, and legacy mode itself, use a bounded direct-EA read. Sections below describe the current behaviour; the activation history further down is unchanged.

Implements section C of [unify-gauge-consumers](../openspec/changes/unify-gauge-consumers/tasks.md)
on top of the [#51-A client](RDP-CLIENT-51A.md) and the [#51-B Trent adapter](RDP-TRENT-51B.md).
The consumer is `/api/levels`. There are two producers: RDP's read API
(`ea-colwick-level`) and, since #90, direct EA (originally the scraper's `levels/latest.json`). The scraper, predictor and RDP
repositories are unchanged. **Every deployed target stays `RDP_LEVELS_SOURCE=legacy`.**
This slice adds no Vercel setting, deployment, AWS change or production cutover.

## Modes

`getLatestLevelsSnapshot()` reads only `RDP_LEVELS_SOURCE`, independently of the
Trent and alerts keys. If it's absent it is `legacy`. An invalid value logs an
error and serves legacy. The default path never constructs the RDP client.

| Mode | `level_data` | `forecast_data` | Requests | Side effects |
| --- | --- | --- | --- | --- |
| `legacy` | Direct EA, else last-known EA (stale) | `[]` | One bounded EA read | Warning when EA is unavailable |
| `shadow` | The legacy result object, unchanged | `[]` | EA read, concurrent with one bounded RDP Colwick history | One log line per snapshot |
| `rdp` | RDP, else fresh validated direct EA, else stale | `[]` | One bounded RDP history; EA only when RDP is not fresh | Degraded log line |

HPP status, CSO, water quality and the predictor forecast APIs do not change. Gauge
alerts don't read `/api/levels`, so no levels mode changes alert inputs. The admin
operational-health `levels` check uses the display path, so it reports what
`/api/levels` serves.

## Contract preservation

- **Envelope:** `{ok:true,data:{level_data,forecast_data,health}}`. The route, its
  `revalidate = 900` and its empty `unavailable` payload are unchanged.
- **`level_data`:** `[{reading_date, reading_level}]`, newest first, in EA `dateTime`
  format (`…:00Z`), in metres (mASD, as the scraper's EA 4009 feed). The depth is the newest 480
  readings (5 days), matching the scraper's default `READINGS_LIMIT`. A test
  asserts that identical source data gives `level_data` deep-equal to legacy.
- **`forecast_data`:** always `[]`. The government station-page forecast is retired
  (#90) and the ML forecast is **never** copied into it; it is served only by
  `/api/s3forecast`.
- **Health (additive):** top-level `health` keeps its fields and describes
  **observed levels**. `source` is `river-data-platform-levels` (rdp) or
  `environment-agency-levels` (legacy/shadow); the route's empty payload uses
  `levels`. `generatedAt` is the newest served observation, and `state` is
  `fresh|fallback|stale|unavailable`. Two sub-objects are added in every mode:
  - `health.observed`: `{origin: rdp|ea|cache|null, state, observedAt, ageSeconds}`
  - `health.forecast`: `{source: "government-forecast", state: "unavailable", reason: "retired", …}`.
    It never affects the top-level state.

  RDP and EA error codes are only logged server-side, never returned.

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

In rdp mode the RDP read runs first. Selection is per complete series, and RDP and
EA points are never mixed:

1. Use a fresh RDP series (newest observation ≤ 30 minutes old). No EA request is made.
2. Otherwise make **one** direct-EA request
   (`/flood-monitoring/id/stations/4009/readings?_sorted&_limit=672&parameter=level`,
   the Trent dashboard's URL and 900 s fetch cache) with an 8 s deadline. Accept it
   only if the whole array is valid: every row is the `4009-level-stage-i-15_min-mASD`
   measure, every value is finite, no row is `Suspect|Rejected|Missing`, and times
   strictly descend. Use it if it's fresh; `state` is then `fallback`.
3. Otherwise serve the newest of stale RDP, stale EA or this instance's
   last-known series (`cache`), reported `stale`. `buildOperationalHealth` ranks
   stale above fallback, so old data can never show as acceptable fallback.
4. If there is no series, the service throws and the route returns its existing
   empty `unavailable` payload (`level_data: []`, `forecast_data: []`).

## Shadow comparison

The legacy (direct-EA) result is returned as-is, and a legacy failure is rethrown exactly as
in legacy mode. The RDP read cannot reject. `compareTrentSeries` compares the 480
legacy (direct-EA) readings with the RDP 7-day history **only at exactly equal observed
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
shared RDP history data cache. Since #90 legacy mode reads direct EA, so rolling back no longer depends on the scraper snapshot. Rollback is tested: legacy mode never
calls the client, serves the legacy result exactly, and doesn't hide an EA
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
