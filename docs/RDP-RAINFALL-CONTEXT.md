# Observed rainfall context on `/trentweirs#rainfall` (Wave C C2)

Product contract: [observed-rainfall-context spec](../openspec/changes/wave-c-rdp-product-features/specs/observed-rainfall-context/spec.md).
Producer contract: RDP [RAINFALL.md](https://github.com/tclare95/river-data-platform/blob/main/docs/RAINFALL.md) (#54) and the
`PeriodTotal*`/`Rainfall*` schemas in RDP's [openapi.json](https://github.com/tclare95/river-data-platform/blob/main/docs/openapi.json).

## What visitors see

Below the Trent gauges dashboard, an **Observed rainfall** panel (stable anchor `#rainfall`) shows:

- **How much rain has been recorded**: one row per rain gauge with the last 6 h, 24 h and 72 h of reports. A total in
  mm is shown only when every 15-minute interval in that window was reported and usable. Otherwise the panel says
  "at least X mm" (the sum of what was reported, a lower bound because depths are non-negative) and "N of M intervals
  missing". A window with no reports says "No reports", never 0 mm.
- **Where it has been raining**: the same table compares the six gauges, each with a coarse area and EA gauge reference
  (EA anonymises rain gauge metadata, so locations are deliberately coarse; there is no map).
- **Latest report and delay**: the newest label and its age, measured from the label. Up to two hours is described as
  the usual reporting delay (EA telemetry normally arrives 30–70 minutes late in batches); beyond that a "Delayed"
  badge. RDP marks almost all rainfall `stale` by design, so that state is not repeated as a warning.
- **Rainfall and Colwick level over the same period**: two stacked panels on one shared time axis, 24 h or 72 h, for a
  selected gauge. Bars are 15-minute totals (mm per 15 min); the line is Colwick level (m). Each panel has its own value
  axis; they never share one. Missing or unusable intervals are hatched gaps; labels after the newest report are shaded
  "not reported yet". Hovering shows the label, amount (or "Missing (not zero)"), its label convention, whether the
  source corrected it, and the Colwick reading at that time.
- Copy that keeps it **observed, not forecast** (predicted rainfall stays on `/forecastinfo`), and that makes **no causal
  or travel-time claim**.

## Rules preserved from RDP

| Concern | Behaviour |
| --- | --- |
| Interval totals | Each row is a 15-minute period total in mm at a provider label, never an instantaneous rate or point reading. |
| Label convention | Physical start/end times are stated only for rows (and complete windows) where RDP declares `period_end`/`period_start`. Verified bars span their period; `unverified` bars are hatched and centred on the label, with a note that their alignment with the level line is only accurate to about 15 minutes. Today every live label is `unverified` (RDP's declared spans end 2026-11-11T14:00Z; Ashbourne and Lea Marston are undeclared throughout). |
| Absent ≠ zero | Absent and ineligible (`Missing`/`Suspect`/negative) labels count as missing, never as 0 mm and never in a sum. Four eligible zeroes are a complete 0 mm. |
| Lag | Windows end at each gauge's newest report, so the normal undelivered tail is "pending", not missing. If nothing has arrived for over six hours (or nothing at all), windows end now and the silence counts as missing. |
| Revisions | RDP serves the latest revision. Rows with `revision > 1` are counted and noted ("corrected by the source after first receipt"). `knownAt` is not used: this view shows what RDP holds now. |
| Pagination | 78 h is 312 labels, read with `limit=1000`, so normally one page and RDP's `meta.window` is present. If RDP paginates (window withheld as `paginated`), up to three pages are followed, the same rules are applied locally and the panel says RDP's own summary was not available. |
| Cross-check | When RDP's window is present, its expected/reported/eligible/absent/ineligible counts must equal what the rows show over the requested range, or the gauge is refused as `invalid_response`. |
| Contract violations | Any envelope or row breaking the period-total contract (an instantaneous `value`/`observedAt`, non-`mm` unit, wrong provider measure, off-grid or repeated label, boundaries contradicting the convention, a window claiming a total while incomplete, etc.) is refused as a whole for that gauge. |

## Reads and caching

Server-side only, through the existing signed client (`libs/rdp/client.js`), on every page view at most:

- `GET /v1/measurements/latest?ids=<six ids>` (one request), and
- `GET /v1/measurements/{id}/observations?from&to&limit=1000` for each of the six IDs over a 78-hour range aligned to the
  15-minute grid (72 h windows plus up to 6 h of source delay).

Each read is cached in the Next data cache for 900 s keyed by the aligned range; failures are not cached. The public
route `GET /api/rainfall/observed` takes no parameters (it is not a general RDP proxy). A fully available answer is
CDN-cached for 15 minutes (`s-maxage=900, stale-while-revalidate=300`), a partial or unavailable one for 60 s. The
browser refreshes with the 15-minute SWR policy. The Colwick level line reuses `/api/trentweirs` (the same SWR request
as the dashboard above, so it honours `RDP_TRENT_SOURCE`), and adds no read.

Measurement IDs (production registrations v2–7, publication v2, collection selections v3/v4):

| Gauge | RDP measurement ID | EA flood-monitoring measure |
| --- | --- | --- |
| Stone | `ea-stone-rainfall` | `3014-rainfall-tipping_bucket_raingauge-t-15_min-mm` |
| Lea Marston | `ea-lea-marston-rainfall` | `3288-…` |
| Ashbourne | `ea-ashbourne-rainfall` | `3323-…` |
| Ashford Hall | `ea-ashford-rainfall` | `3616-…` |
| Wanlip | `ea-wanlip-rainfall` | `3683-…` |
| Sutton Bonington | `ea-sutton-bonington-rainfall` | `3652-…` |

The client keeps rainfall apart from levels: `RDP_RAINFALL_MEASUREMENTS`/`getRainfallMeasurement` and
`getRainfallLatest`/`getRainfallObservations` with their own parser (`libs/rdp/rainfallContract.js`). The level/flow
map, `getLatest`/`getObservations` and their validation are unchanged, and each side refuses the other's IDs.

## Availability and configuration

No flag: the panel is display-only, bounded, read-only and fails to an explicit unavailable state, so it works by
default wherever RDP rainfall is readable and is harmless elsewhere.

- **Production**: the Vercel Production caller role may invoke `GET /v1/measurements`, `/latest`, `/*/observations` and
  `/*/health` on the production read API (route wildcards, no per-ID restriction), and the six IDs are published there,
  so no IAM change is needed.
- **Preview (staging)**: RDP staging has no rainfall registration, so reads return `MEASUREMENT_NOT_FOUND` and the panel
  says the gauges are not published in this environment.
- **Local development**: there is no RDP client (Vercel OIDC is required), so the panel says the data is not connected.

Each gauge fails independently with a coarse reason (`not_configured`, `not_published`, `not_authorised`,
`invalid_response`, `temporarily_unavailable`). Logs carry only those reasons, never RDP bodies.

## Not in scope

No rainfall alerts, forecast changes, predictor features, hydrological modelling, travel-time estimates, new RDP
registrations, collection changes, history backfill or generic rainfall analytics.
