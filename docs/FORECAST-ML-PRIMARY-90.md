# ML forecast as the only primary forecast (#90)

**Decision (owner, 13 November 2026, [#90](https://github.com/tclare95/isHPPOpen/issues/90)):** trent-predictor's
ML forecast is isHPPOpen's only primary forecast. The Node scraper's government station-page forecast, and
the `levels/latest.json` snapshot that carried it, no longer block retiring the scraper. No replacement
publisher is built only to keep the old forecast alive. An optional, separately labelled EA forecast may come
later from RDP ([RDP #57](https://github.com/tclare95/river-data-platform/issues/57)); it would never replace or
masquerade as the ML forecast.

## What changed in the website

| Surface | Before | After |
| --- | --- | --- |
| `/forecastinfo` | "New Forecast / EA Forecast" selector; the EA option charted `/api/levels.forecast_data` and hid accuracy, confidence, stats and stability | No selector. Predictor forecast, accuracy, 95% confidence toggle, stats and stability shown by default; observed Colwick levels from `/api/levels` on the chart |
| `/api/s3forecast`, `/api/forecastaccuracy`, `/api/forecaststability`, model CSVs, forecast alerts | Predictor S3 CSVs | **Unchanged** (no code change) |
| `/api/levels` envelope | `{level_data, forecast_data, health}` | **Unchanged keys.** `forecast_data` is always `[]` and is never filled with ML rows |
| `/api/levels` `level_data`, `RDP_LEVELS_SOURCE=rdp` (Production) | RDP, else the scraper snapshot's `level_readings`, else stale | RDP, else **one bounded direct-EA read**, else stale |
| `/api/levels` `level_data`, `legacy`/`shadow` (Preview/Development default, Production rollback target) | Scraper `levels/latest.json` | **Direct EA**, else this instance's last-known EA series (stale) |
| `S3_LEVELS_URL` | Read on every `/api/levels` request in every mode | **Not read.** Remove the Vercel variable after the release has settled |

### Health

`health` keeps `source, generatedAt, fetchedAt, ageSeconds, state` and describes **observed levels only**:

- `source`: `river-data-platform-levels` (rdp) or `environment-agency-levels` (legacy/shadow).
  The route's last-resort empty payload uses `levels`.
- `health.observed.origin`: `rdp | ea | cache | null`. `ea` replaces the old `legacy` (scraper snapshot) value.
- `health.forecast`: always
  `{source: "government-forecast", state: "unavailable", reason: "retired", generatedAt: null, ageSeconds: null}`.
  This sub-object never degrades the top-level state, and the admin operational-health `levels` badge reports observations only.
  The primary forecast's health is the admin `forecast` check (`/api/s3forecast` `health`), which is unchanged.

### Direct-EA observation fallback

`readEaColwickLevels()` in `libs/services/levelsService.js` reuses the Trent dashboard's direct-EA reader:

- one request: `…/flood-monitoring/id/stations/4009/readings?_sorted&_limit=672&parameter=level`.
  This is the same URL and 900 s fetch cache as `/api/trentweirs`, so the two share one upstream call per window;
- an 8 s deadline (`EA_LEVELS_READ_DEADLINE_MS`) so a slow EA response cannot hold `/api/levels` open;
- whole-series validation with `validateLegacySeries`: every row must be the
  `4009-level-stage-i-15_min-mASD` measure (mASD, same datum as RDP `ea-colwick-level`), with a finite
  value, no `Suspect|Rejected|Missing` quality and strictly descending times;
- in `rdp` mode it is called **only** when RDP is not fresh. RDP and EA points are never mixed. Stale
  outranks fallback, so old data never shows as acceptable fallback.

Gauge alerts, HPP status and the predictor do not read `/api/levels`, so none of this changes an alert input.

## Remaining consumers of the scraper's legacy river outputs

| Consumer | Reads | Status |
| --- | --- | --- |
| isHPPOpen `/api/levels`, `/forecastinfo`, admin health | `levels/latest.json` | **Migrated by this change** |
| trent-predictor | none (EA and MET Norway directly) | not a consumer |
| River Data Platform | none (an IAM test asserts it has no access) | not a consumer |
| `npm run calibrate:water-quality` (offline, manual) | Mongo `riverschemas` newest reading per document, 365-day window | Not runtime. Once publication stops, its runoff window stops at the last record. The owner accepts this, or it moves to RDP history before the scraper release |
| Unknown public HTTP readers of the public `levels/latest.json` | public object | Not inventoried (no S3 access logs). The object stays readable but frozen, and `model_date` shows its age |

## Release sequence

Each production step is a **separate explicit approval**. Local merges authorise nothing.

| # | Step | Repository | Verify (read-only) | Rollback |
| --- | --- | --- | --- | --- |
| 0 | Merge web PR | isHPPOpen | CI green; Preview: `/api/levels` `health.source = environment-agency-levels`, `forecast_data: []`, `health.forecast.reason = retired`; `/forecastinfo` has no selector and shows accuracy/confidence/stability | Revert PR |
| 1 | **Production web deploy** of merged `main` (Vercel, no env change) | isHPPOpen | `/api/levels`: `health.source = river-data-platform-levels`, `observed.origin = rdp`, `forecast_data: []`, `health.forecast.reason = retired`, 480 rows. `/api/s3forecast`, `/api/forecastaccuracy`, `/api/forecaststability` match their pre-deploy shape. The next `/api/internal/alerts/run` cron runs normally. Logs: any `RDP levels display degraded` line shows `eaError: null` when `origin: ea` | Revert the merge and redeploy current Production. The scraper is still publishing, so the old code works unchanged. Do **not** `vercel rollback`; older deployments carry older env snapshots |
| 2 | Observe ≥ 24 h | isHPPOpen | No `EA levels unavailable` or `origin: null` beyond EA outages; `/forecastinfo` normal | as step 1 |
| 3 | Scraper release 1: merge [scraper #17](https://github.com/tclare95/ishppopenScraper/pull/17) (`LEGACY_RIVER_PUBLICATION: "enabled"`), prepare, review (Modify `LambdaFunction` only), apply | ishppopenScraper | No behaviour change: `levels/latest.json` and `riverschemas` keep advancing | Revert PR, prepare, apply |
| 4 | Gate: owner accepts the calibration-script window and unknown public readers (table above); steps 1–3 recorded on #90 | — | — | — |
| 5 | **Scraper release 2**: `LEGACY_RIVER_PUBLICATION: "disabled"` ([scraper #18](https://github.com/tclare95/ishppopenScraper/pull/18), draft), prepare, review (Modify `LambdaFunction` environment only), apply | ishppopenScraper | Logs `=> Legacy river publication disabled`; no forecast fetch; `levels/latest.json` `LastModified`, newest dated `levels/` object and newest `riverschemas.model_date` stop advancing; HPP, `waterQuality` and CSO continue; website unchanged | Revert to `enabled`, prepare, apply. Publication resumes next run, with no backfill (see scraper `DEPLOYMENT.md`). Re-enable while EA is healthy |
| 6 | Later, separately reviewed cleanup | both | — | — |

Step 6 covers: remove `S3_LEVELS_URL` from Vercel (it is unused after step 1), remove the
`forecast_data` field after any other consumer is reviewed, and delete the scraper's dormant forecast and
snapshot code. Removing the public bucket policy or the bucket is never part of this sequence, and no
historical object or record is deleted at any step.

**Order matters:** the web release (1) must be live before scraper release 2 (5). Release 2's rollback
does not depend on the web rollback, and web rollback is safe only **while the scraper still publishes**.
After step 5, roll back the web only together with re-enabling publication.
