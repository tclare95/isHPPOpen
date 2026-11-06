# Sewage Map compatibility inventory

Reviewed 6 November 2026 against web `a9127f6` and legacy scraper source
(`waterQuality.mjs` blob `6dc9da5`, `app.mjs` blob `bb456e8`, matching GitHub main).
Repository/issue and public upstream source inspection only: no hosted Sewage Map
GeoJSON, provider, MongoDB or AWS reads.
This records consumer requirements, not an approved membership or source switch.

## 1. Exact legacy input and application entry

[`waterQuality.mjs`](https://github.com/tclare95/ishppopenScraper/blob/05881c6457949ee5713a3acf703455edf9939077/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs)
`getNWSCDownstreamImpactInfo()` requests
`https://d1kmd884co9q6x.cloudfront.net/downstream_impact/severntrent/severntrent_info_now_incl_48hrs.geojson`.
It selects the nearest **Point**, strictly less than 250 m from
`[-1.0948257285275267, 52.944976358291115]` (longitude, latitude), using Turf distance.
Equal-distance ties retain the first feature. It consumes information points,
not Sewage Map's downstream river linework.

| Required input | Scraper output under `water_quality` | Subsequent consumer |
| --- | --- | --- |
| `features[]`, `geometry.type = "Point"`, `geometry.coordinates` | Selected point's distance becomes `distance_meters`, a two-decimal **string** | Selection/provenance only; no current web reader of distance found |
| Selected `properties.CSOs` (array of provider ID strings) | `CSO_IDs`, copied without validation/deduplication | Main handler's polling plan; web status joins and location list |
| Selected `properties.number_upstream_CSOs` | `number_upstream_CSOs`, copied unchanged | Summary API `WaterQuality.NumberUpstreamCSOs = Number(value) || 0`; no direct current dashboard reader found |
| Selected `properties.number_CSOs_per_km2` | `number_CSOs_per_km2`, copied unchanged | Summary API `WaterQuality.NumberCSOsPerKm2`; density history, chart, calibration, indicator and alerts |

No feature ID, name, source timestamp, area, CRS metadata or status is read from
Sewage Map. The source's numeric field types are not enforced (web accepts numeric
strings). [`app.mjs`](https://github.com/tclare95/ishppopenScraper/blob/05881c6457949ee5713a3acf703455edf9939077/is-hpp-open-scraper/is-hpp-open/app.mjs)
writes `{ id: UUID, scrape_timestamp: new Date(), water_quality: result }` to
MongoDB `waterQuality` on the 15-minute invocation. This timestamp is retrieval/
processing time, **not** Sewage Map's observation/publication time.

The same result's nonempty `CSO_IDs` drives SQS batches of `{ id }` (up to ten),
or inline polling when no queue is configured / enqueue throws. `getCSOInfo(id)`
queries Severn Trent ArcGIS by **`Id`**, requests WGS84 coordinates, and converts
`StatusStart`, `LatestEventStart`, `LatestEventEnd`, `LastUpdated` to dates.
The worker/inline path inserts provider `{ attributes, geometry, DateScraped }`
into `csoData`. Keep provider `Id` distinct from object IDs, permits or RDP keys.

Existing failure behaviour matters: no nearby point returns a **message object**
which can become the latest summary with no IDs; a fetch/parse error throws,
leaving the previous summary and scheduling no new CSO work that run. Neither
is a verified empty membership. Do not reproduce these weaknesses as artifact validation.

## 2. Consumers: identity, dynamic status and density are separate

| Consumer / seam | Stable upstream identities | Dynamic status | Historical activity density |
| --- | --- | --- | --- |
| Scraper main / SQS worker / inline fallback | Exact Severn Trent `Id` strings to poll | Provider feature stored unchanged apart from dates / `DateScraped` | Main stores source density separately; worker does not compute it |
| [`waterQualityService`](../libs/services/waterQualityService.js), `/api/waterquality`, `/cso`, `/cso/[id]` | Summary IDs deduplicated, nonblank strings retained; status joined on `attributes.Id` | Latest per ID; summary queries last 60 min, freshness 30 min (5 min future tolerance) | Summary exposes copied density; `/csodensity` reads saved density, not `csoData` |
| [`/waterquality`](../app/waterquality/page.js), [`csoMap`](../components/functional/csoMap.js) | IDs determine locations/status-count population | Active/recent/offline/unknown cards; active + ended-within-6/24/48h markers (default 6h), coordinates and event dates | Page fetches 120h for chart and combined indicator |
| [`csoChart`](../components/functional/csoChart.js) | No direct ID dependency | No direct status dependency | Hourly sample means, 24h/5d views, calibrated reference lines |
| [`waterQualityIndicator`](../libs/waterQualityIndicator.js), [`calibration script`](../scripts/calibrate-water-quality.mjs) | No direct ID dependency | No direct status dependency | Three-hour density sample mean; calibration uses saved history |
| [`colwickAlertsService`](../libs/services/colwickAlertsService.js) water-quality subscriptions | Indirect through snapshot health, not per-ID rules | Does not threshold active counts or spill duration | `getWaterQualityDensitySeries(3)` → CSO assessment → green/amber/red; fresh summary also gates evaluation |

Active requires fresh summary + fresh record + `Status=1`; recent requires a
fresh `Status=0` record whose latest event ended within 48h; offline is fresh
`Status=-1`; otherwise unknown. A fresh clear record outside the recent window
also falls into unknown. Coordinates and `ReceivingWaterCourse` come from Severn
Trent, not Sewage Map. `CSOActiveTime` sums ongoing active-event hours clipped to
48h; it is **not** the density metric or complete historic spill-event duration.
Summary freshness is based on `scrape_timestamp`; record freshness uses
`DateScraped`, while `LastUpdated` is exposed separately.

The homepage links to this dashboard. Current main also has an optional River
Tracer overlay, independent of these inputs. Alerts use the **CSO-only** assessment;
the display takes the worse of CSO activity and four-hour river rise. Preserve
both paths, subscription state and delivery/rearm behaviour during any cutover.

## 3. Minimum reviewed RDP HPP artifact

[RDP #47](https://github.com/tclare95/river-data-platform/issues/47) supplies routing
and candidate offline classification; its HTTP locate/upstream/downstream routes
do not return reviewed outfall IDs. [#64](https://github.com/tclare95/river-data-platform/issues/64)
requests reviewed relationships/parity. The [consumer roadmap at PR #65's reviewed commit](https://github.com/tclare95/river-data-platform/blob/cf716e04896eb6a632b258f9a3ddeaa76c32307d/docs/RIVER-TRACER-CONSUMER-ROADMAP.md)
is still proposed at this review; [isHPPOpen #114](https://github.com/tclare95/isHPPOpen/issues/114)
and the [merged consumer requirements](../openspec/changes/hpp-river-explorer/specs/hpp-river-explorer/spec.md)
retain independent site membership, metric and release approval.

A small immutable file plus linked review evidence is sufficient for this fixed
site. These are required **contents**, not a prescribed JSON schema or new service:

- Version/integrity identity, generation date, provider and exact Severn Trent
  polling IDs; HPP target coordinate/reach and coordinate reference system.
- Pinned network/release and catalogue versions, generation method, attribution
  and evidence references sufficient to reproduce the result.
- Explicit effective membership and per-asset review decisions: accepted,
  excluded or unresolved, reasons and reviewer/date. Candidate, catchment-only,
  ambiguous, missing-coordinate and legacy-only cases remain visible.
- Coverage numerator **and denominator/population**, extent/gaps and unresolved
  identities; matched/reviewed coverage must not masquerade as complete upstream coverage.
- Attributed legacy comparison with selected point/distance, capture/source time
  where available, layer/window, ID/count/density values; common, RDP-only,
  legacy-only and unknown sets, and an explicit isHPPOpen go/no-go decision.
- State whether membership is all reviewed upstream assets or an active/recent
  subset. Record the separate count/density meaning/window/denominator decision
  or explicitly mark it unresolved. A static artifact supplies **no live status**.
  For legacy metric parity, retain evidence of the selected D8 cell, upstream
  area and raster identity/hash; an RDP catchment area is not automatically equivalent.

Before consumption, validate supported version, integrity, site/provider,
nonblank unique provider IDs and review completeness; reject unintended empty
or unapproved sets. Pin the accepted version and retain the previous version for
rollback. Failed refresh/validation cannot replace it with `[]` or fresh zero
activity. A successor must still emit compatible Mongo snapshots or separately
migrate their readers. Do not fabricate Sewage Map distance for an RDP match.
Neither this artifact nor geographic matching changes RDP #71 collection selection.

## 4. Density: known and unresolved

**Known:** the scraper copies `number_CSOs_per_km2` from a file named
`now_incl_48hrs`; it does no area/window calculation. The service emits
`{ timestamp: scrape_timestamp, numberCSOsPerKm2: Number(value) }` for finite
values. Default 15-minute history returns stored samples; optional 60-minute
buckets and the chart use arithmetic sample means, without gap filling or time
weighting. The indicator averages samples in the three hours ending at the
newest sample, requires eight, and rejects data older than 30 minutes.

[`waterQualityCalibration.json`](../libs/waterQualityCalibration.json) records
365-day calibration ending 2026-08-31, 28,291 rolling means, elevated/high at
60th/80th percentiles (`0.0105` / `0.0258`). The script uses three-hour means with
at least eight samples. Runoff is separately calibrated over four-hour rises
(`0.081` / `0.101` m; only 49 calibration samples). These are relative indication
bands, not contamination/safety limits or density derived from current status.

**Resolved from upstream code (follow-up review):**

- Sewage Map [`update_downstream.py`](https://github.com/AlexLipp/sewage-map/blob/d8171e2778e93bfc3d4a7b17f6136309f0ea78be/update_downstream.py)
  publishes this exact info filename using `get_downstream_info_geojson(include_recent_discharges=True)`.
  [POOPy's selector](https://github.com/AlexLipp/POOPy/blob/a14e36d91da6e51e44912b5b87afe78cc453c59b/poopy/poopy.py#L1378-L1401)
  takes monitors with truthy `discharge_in_last_48h`: this is an **activity-filtered
  membership**, not every upstream asset.
- The [Severn Trent adapter](https://github.com/AlexLipp/POOPy/blob/a14e36d91da6e51e44912b5b87afe78cc453c59b/poopy/companies/severn_trent.py#L75-L120)
  sets that flag for `Status=1`, otherwise for a non-null `LatestEventEnd` with
  `company timestamp - event end <= 48h`. Offline monitors can therefore qualify;
  missing end dates yield `None` and are omitted unless currently discharging.
  This predicate has no `LastUpdated` freshness check or future-end lower bound.
  Monitor `site_name`, used in output `CSOs`, is Severn Trent `Id`.
- [`_calculate_downstream_info`](https://github.com/AlexLipp/POOPy/blob/a14e36d91da6e51e44912b5b87afe78cc453c59b/poopy/poopy.py#L1175-L1241)
  uses D8 flow accumulation: `number_upstream_CSOs = impact[cell]` and
  `number_CSOs_per_km2 = impact[cell] / drainage_area_km2[cell]`. Area is accumulated
  raster-cell area (`pixel width * -pixel height / 1,000,000`), not river length
  or a count of assets. Information points exist only where impact is positive.
- The [impact calculation](https://github.com/AlexLipp/POOPy/blob/a14e36d91da6e51e44912b5b87afe78cc453c59b/poopy/poopy.py#L1073-L1108)
  assigns **one per occupied source cell** before accumulation, while the ID list
  appends each contributing monitor. Co-located monitors can thus make the count
  differ from `CSOs.length`. Synthetic example: two qualifying IDs in one source
  cell, both upstream of a 100 km² point, give two IDs, count 1 and density 0.01.

**Still unverified:** the POOPy revision/raster actually deployed behind CloudFront
and used throughout the calibration year, the HPP selected cell and numeric area,
collocated/out-of-bounds cases in real data, publication lag, timezone/invalid-date
effects and time-aligned parity. Public code identifies the formula; it does not
establish deployed/historical equivalence to RDP. No live parity series or
calibration reproduction was obtained here.

Beware coercion: summary missing/invalid values become zero; history drops
`undefined`/nonnumeric values but `Number(null)` and `Number('')` are zero. A
replacement must not emit null/empty/frozen density as fresh measured inactivity.
Static membership count divided by an RDP catchment area cannot inherit these
thresholds. Membership parity alone does not establish density parity.

## 5. Smallest reversible migration, after separate approval

1. Complete #64's reviewed artifact and timestamp-aligned comparison of the
   activity-filtered legacy set. A single captured set is not proof of parity
   over time; expanding to all static upstream IDs can change
   polling load and unknown/offline counts even when active markers match.
2. Prove equivalent dynamic count/density from compatible evidence and windows
   before removing the shared request, using the source formula above as the
   compatibility reference. For unchanged public behaviour, preserve
   the existing density series meaning, calibration and alert decisions. If
   equivalence fails, versioning/recalibration/history treatment is separate work
   and this behaviour-preserving cutover is **no-go**.
3. In the **existing single scraper writer**, replace only relationship selection
   with the pinned reviewed artifact, alongside the proven compatible metric
   input. Preserve Mongo shape/timestamps, cadence, Severn Trent `getCSOInfo`,
   queue/inline/worker flow, web APIs, charts and alerts. No new RDP online endpoint,
   database, hydrological model or #72 migration is required for membership alone.
4. Compare offline outputs before separately authorising release; retain the
   previous scraper revision and artifact. Roll back the selection change in that
   same writer, without replaying history/alerts or starting another writer.
   Keep retained history and source/version evidence interpretable across the boundary.

**Present decision: evidence preparation only.** Decoupling polling IDs while
still fetching Sewage Map for density is a possible partial step, but does not
remove the runtime dependency. Static membership alone cannot yet satisfy the
requested full removal with public behaviour intact; the dynamic metric gate
remains open. Do not freeze the latest density, infer zero or silently change
the status-count population to make the switch appear complete.

Existing synthetic behaviour examples already live in
[`waterQualityService.test.js`](../__tests__/waterQualityService.test.js) (ID
deduplication, active/recent/offline/missing, stale summary, hourly density),
[`waterQualityIndicator.test.js`](../__tests__/waterQualityIndicator.test.js),
[`csoChart.test.js`](../__tests__/csoChart.test.js),
[`waterQualityPage.test.js`](../__tests__/waterQualityPage.test.js) and
[`alertEvaluationReliability.test.js`](../__tests__/alertEvaluationReliability.test.js).
No duplicate fixture or integration implementation is needed for this inventory.
