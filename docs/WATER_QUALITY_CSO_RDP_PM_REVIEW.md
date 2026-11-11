# PM review: water-quality and CSO migration to RDP (11 November 2026)

**Scope:** audited `tclare95/isHPPOpen` main at `f5213c72d136`, `tclare95/river-data-platform` main at `02b38070a707` (11 November 2026), and `tclare95/ishppopenScraper` main. Source-code and merged-PR review; **not** a live AWS, provider, Mongo or CloudFront parity test.

**Decision:** make RDP canonical for provider-derived CSO evidence, current status, history, revisions, coverage and hydrological relationships; keep isHPPOpen responsible for HPP membership acceptance, 48-hour legacy-density compatibility, calibrated site risk, UI and alerts. No new live writer or automatic source switch.

## 1. Existing product (do not rebuild)

`/waterquality` already has point-marker map with current/6/24/48 h filters, active/recent/offline/unknown counts, 24 h/5 d density chart, CSO three-hour averaged and river-rise four-hour calibrated indicator, homepage link, water-quality email subscriptions and evaluator. RDP's upstream/downstream River Tracer network/catchment overlay is **already implemented** in isHPPOpen ([#116](https://github.com/tclare95/isHPPOpen/pull/116); copy simplified in #117). Keep these UX contracts, including unavailable/partial status and existing alert state. [#114](https://github.com/tclare95/isHPPOpen/issues/114) remains the membership/density dependency, **not** a new map project.

## 2. Current producer capability matrix

| Source / concern | Verified on RDP main | Operational and consumer qualification |
| --- | --- | --- |
| #71 catalogue and selected polling | Severn Trent and Wessex Water provider adapters; last-good/versioned catalogue, explicit stage sets, pinned provider IDs and isolated refresh/status jobs | `production.json` requests a daily catalogue refresh and 15-min status; `staging.json` CSO is off. Stage files and merged PRs are intent, not current run/health evidence. |
| #72 claims / current status | Evidence-first claim ledger, `CURRENT`, independent reported/effective state, per-provider provisional freshness, no false stop on stale/offline | Six signed read routes merged. Verify actual deployed release, signed isHPPOpen production role and continuous collection, measured lag and source anomaly rates before using as normal reader. |
| #72 events/revisions | Stable event IDs, ongoing/completed/unresolved, holds, corrections, immutable revisions, S3 verified history and 24-month hot-expiry eligibility | Last-event-slot sampling can miss complete between-poll events; archived reads and coverage are truthful, not a guarantee of exhaustive events. TTL **eligibility** is not proof of physical expiry. |
| #72 coverage and health | Per-outfall observed collection spans, gaps, catalogue/selection/health and 6 bounded `/v1/cso/*` GET routes | Empty events + incomplete coverage is **unknown**, not zero. Avoid assuming source reporting completeness; `reportingCompleteness` remains unverified. |
| #69 UK providers | Wessex verified second provider and production `bath-avon` selected; others are planned/investigation | Neither UK-wide coverage nor a site-level HPP membership is implied by multi-provider capability. |
| #70 historical EDM | No-write, rights-checked EA 2025 detailed-file preview, reviewed identity requirements, **implemented operator-gated canonical importer** (merged RDP #102) | Production read-only plan yielded 392 eligible events over 7 Severn Trent assets; mappings are still **proposed** and owner sign-off/import is not evidenced. Annual 12/24-block counts are a separate domain, not exact events. |
| #47 River Tracer | GB network locate/upstream/downstream API, offline candidate `OutfallLinker`/`UpstreamOutfallClassifier`, downstream route generation | The HPP overlay is already consumed. **Reviewed** HPP upstream outfall relationships and dynamic CSO impact GeoJSON/online upstream-outfall service are not yet established as consumer-ready; #64 is the producer gap. |
| Sewage Map-compatible metric | **Not** a canonical RDP producer contract today | Requires reviewed, time-varying activity membership, legacy raster cell + drainage-area denominator, deduped occupied-cell semantics, 48-hour window and calibration parity. Ownership of site metric compatibility remains isHPPOpen. |

**Issue-number clarification:** the canonical CSO #72 is [isHPPOpen issue #72](https://github.com/tclare95/isHPPOpen/issues/72) and its migrated [RDP OpenSpec](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/modernise-cso-data). **RDP issue #72 is an unrelated measurement selection release**, not the CSO subsystem.

**Production selection in RDP main:** `hpp-upstream`: `SVT01157, SVT01294, SVT02056, SVT02180` (Severn Trent); `bath-avon`: `WXW00476, WXW00838, WXW00924` (Wessex). This is a snapshot of the legacy's **activity-filtered** HPP set on 7 November, not a reviewed complete upstream inventory. A single provider latest-event slot was observed replacing an earlier SVT01294 spill between manual test reads; do not claim zero spill or event completeness from no returned events.

## 3. Exact legacy dependencies and consumers

`ishppopenScraper/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs`:
- GET `.../downstream_impact/severntrent/severntrent_info_now_incl_48hrs.geojson` from NWSC/Sewage Map; selects nearest Point within 250 m of HPP; copies `properties.CSOs`, `number_upstream_CSOs`, `number_CSOs_per_km2` unchanged.
- `getCSOInfo(id)` calls Severn Trent's ArcGIS storm-overflow layer by **provider `Id`**; returns latest status, latest start/end, coordinates and watercourse.

`app.mjs`:
- Every invocation writes `{id, scrape_timestamp, water_quality}` into Mongo `waterQuality`, and uses the **dynamic activity-filtered ID list** to enqueue SQS batches of 10. If queue absent/errors it polls inline.
- `csoWorker.mjs` and inline fallback append status **snapshots**, not canonical event history, into Mongo `csoData` with `DateScraped`.
- `csoArchival.mjs` moves `csoData` older than three months into S3 JSONL and deletes source Mongo after an S3 metadata count check; archival snapshots are not RDP's verified event/revision archive.

isHPPOpen `libs/services/waterQualityService.js`:
- `getLatestWaterQualitySnapshot` reads latest `waterQuality` and `csoData` (last 60-min snapshots for current IDs), builds locations by provider ID, uses scrape-time freshness (30 min; 5-min future tolerance), classifies active/recent/offline/unknown and produces `/api/waterquality` and `/api/waterquality/cso*`.
- `getWaterQualityDensitySeries` reads the **stored summary** values (not `csoData`), defaults to 15-min samples and averages samples in hourly buckets for the existing chart.
- `waterQualityIndicator.js` averages at least eight recent samples over the 3 h ending at the newest sample; stale >30 min gives unavailable. `waterQualityCalibration.json` has year-ending 2026-08-31 density thresholds **0.0105 / 0.0258**. The combined on-page risk also considers 4 h level rise.
- `colwickAlertsService.js` uses CSO density and **fresh** summary to evaluate water-quality subscription risk (green/amber/red); it does *not* threshold provider active counts and does not use the overall river-rise factor. Keep subscription, rearm, idempotent delivery and timestamp semantics.
- `/api/waterquality/csodensity`, chart and historical calibration remain Mongo `waterQuality` consumers until an explicitly accepted metric/history replacement; the River Tracer overlay is independent.

See the detailed [Sewage Map compatibility inventory](SEWAGE-MAP-COMPATIBILITY.md) and [legacy retirement map](LEGACY_SCRAPER_RETIREMENT.md). No existing web or Node code imports RDP CSO status/events today; other RDP gauge/river clients do **not** imply CSO source cutover.

## 4. Sewage Map dynamic metric: required semantics and open evidence

**Do not substitute a static outfall count or a count of live status rows.** From the inspected upstream POOPy/Sewage Map implementation (see the compatibility inventory):
1. The `now_incl_48hrs` information point has a **time-varying activity-filtered** `CSOs` list: currently spilling or `LatestEventEnd` within 48 h of provider timestamp. Offline monitors with a recent qualifying end can still occur. The legacy predicate does not enforce RDP freshness, so a safer new predicate is a **metric version change**, not silent exact parity.
2. The dynamic upstream **count is D8 raster impact[cell]**, built from **one occupied source cell** for all qualifying monitors within that cell. Therefore co-located ID count can differ from the impact count. `number_upstream_CSOs` is not `CSOs.length`.
3. `number_CSOs_per_km2 = impact[HPP selected raster cell] / drainage_area_km2[that cell]`, where the denominator is upstream accumulated **raster-cell area**, not network km, Euclidean circle, or an arbitrary RDP catchment polygon.
4. Capture deployed/raster revision and selected HPP cell, area, georeferencing, excluded or unlinked assets, spatial snapping/ambiguity and licence/attribution. Verify source publish times and time zones against recorded Mongo scrape timestamps.
5. Reconstruct a time-aligned legacy sample series and compare event-based synthetic series on co-location, overlapping events, boundary >=/< 48 h, offline/stale/unknown, revised ends, missing intervals and source lag. Track both **value parity** and the existing 3-hour rolling assessment and email transition differences; use calibration-year data where available.
6. Keep a distinct, versioned **compatible metric** versus a future **improved, coverage-aware metric**. If exact historical equivalence cannot be shown, preserve the old history/thresholds and explicitly approve a new series/recalibration; never backfill invented zeros or silently re-label the old chart.

The publicly inspected algorithm is helpful evidence, **not** proof of the exact CloudFront/raster version deployed over the 2025-26 calibration year. One-day ID parity, membership and today's 48-hour event query are insufficient for historical threshold parity.

## 5. Producer requirements (RDP-owned), without duplicating existing work

1. **#64 / #47**: versioned, reviewed HPP provider-ID-to-upstream-reach decisions with positive/negative/unresolved reasons, source and network/catalogue versions, coverage numerator/denominator, historical legacy information-point comparison and licence. A generated export is enough for this fixed HPP site; an always-on endpoint can wait for a second consumer. **No polling-set change** from this review.
2. **#72 service operations**: produce a signed production smoke report for selected HPP IDs, actual status/event/health/read IAM availability, status schedule continuity, source-age distribution, gaps, and documented response/limit/version behaviour. The six existing GET routes are sufficient for the first consumer slice; no new CSO API by default.
3. **#70**: review/approve (or reject) the seven proposed official Severn Trent 2025 mappings and separately authorise a digest-pinned canonical import. Retain historical assertion provenance, unknown coverage and actual annual 12/24-block differences. No historical writer in isHPPOpen.
4. **#69 / #72 follow-up**: qualify more providers and document explicit coverage where needed; investigate missing between-poll events, reliable source lag and correction windows. RDP should publish coverage and revisability rather than fabricate complete event history.
5. **Potential reusable producer later**: a source-neutral bounded upstream-outfall relationship read and status-aware river-impact GeoJSON after reviewed links and event freshness. It must not own HPP's density thresholds, risk advice or email rules.

## 6. Recommended consumer OpenSpec/issue sequence

| Priority | Deliverable | Owner/tracker | Readiness / release boundary |
| --- | --- | --- | --- |
| P0 | Verify RDP signed production CSO read, selected-ID health, source age, events and gaps; preserve current web baseline in parity fixtures | [Consumer #120](https://github.com/tclare95/isHPPOpen/issues/120) | Read-only diagnostic, no writer/source/alert changes |
| P1 | Add **server-only**, optional/shadow RDP current-status/event adapter and discrepancies for existing APIs | [Consumer #120](https://github.com/tclare95/isHPPOpen/issues/120) | Safe to implement with legacy authoritative; bounded calls/cache and failure isolation |
| P1 | Review HPP upstream relationship artifact, legacy dynamic ID selection, 48 h occupied-cell count/area semantics and density calibration | [Consumer #114](https://github.com/tclare95/isHPPOpen/issues/114), [RDP #64](https://github.com/tclare95/river-data-platform/issues/64) | Evidence/shadow only; separate explicit approval for membership or metric cutover |
| P2 | Optional **event-led** history/coverage/revision analysis inside the **existing** page | [Consumer #121](https://github.com/tclare95/isHPPOpen/issues/121) | Can launch without making event analysis authoritative for risk; label coverage and imported-event provenance |
| P2 | Approve reversible RDP **current status + recent events** consumer switch, independently from density | [Consumer #120](https://github.com/tclare95/isHPPOpen/issues/120) | Explicit product+operational approval, regression/parity and rollback; prior web/alert behaviour preserved |
| P3 | Approve reviewed membership and **compatible or versioned/recalibrated** activity density, then remove runtime Sewage Map | [Consumer #114](https://github.com/tclare95/isHPPOpen/issues/114) | Explicit source/metric/history/alert approval; never infer fresh zero |
| P3 | Retire old `csoData` polling/SQS writes, then `waterQuality` summary writer only after all density subscribers move; leave main Node schedule until all other duties migrate | [Scraper retirement #68](https://github.com/tclare95/isHPPOpen/issues/68) | One canonical writer at each boundary, proof of retention/history, rollback and no notifications replay |

**Possible product improvements (optional, not a rebuild):** timeline/heatmap over real event intervals with carry-in/out, corrected-event diff and freshness labels; selected outfall drill-down from the existing map; per-hour observed spill duration **with a covered-time denominator**; distinguish imported official historical EDM claims from live-reconstructed events; overlay event evidence on the current density chart for comparison. None of these should imply direct pathogen measurement, pollution concentration, travel time or safe paddling.

## 7. Decision and release gates

**Immediate no-approval-required implementation candidates:** read-only diagnostics, shadow adapters, comparison fixtures, optional separately labelled historical views, documented producer evidence. All keep legacy public contracts and alert decisions unchanged.

**Explicit approval required:** production role/IAM changes or deployments; additional RDP polling IDs; historical canonical imports; chosen HPP membership source; metric algorithm/area/window/threshold/history changes; authoritative web status/event source; any alert source/delivery changes; Node/SQS/Mongo writer shutdown; public publication of rights-dependent data.

**No second authoritative writer:** RDP writes provider evidence/events to its own store; existing scraper continues writing legacy Mongo until each consumer has switched. isHPPOpen shadows by reading, not writing competing current-state/events or replaying alert transitions. Source-mode rollback is reader-only until a separately reviewed writer-retirement cutover.

## 8. Evidence references

- [RDP six CSO reads and gap/integrity semantics](https://github.com/tclare95/river-data-platform/blob/main/docs/CSO-HISTORY.md); [read API implementation](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.ReadApi/CsoReadService.cs); [CSO operations](https://github.com/tclare95/river-data-platform/blob/main/docs/CSO-OPERATIONS.md).
- [RDP production CSO schedule PR #101](https://github.com/tclare95/river-data-platform/pull/101); [#70 historical import PR #102](https://github.com/tclare95/river-data-platform/pull/102); [historical evidence / proposed mappings](https://github.com/tclare95/river-data-platform/blob/main/docs/CSO-HISTORICAL-PREVIEW.md).
- [RDP #64 upstream-relationship review](https://github.com/tclare95/river-data-platform/issues/64); [RDP #69 multi-provider](https://github.com/tclare95/river-data-platform/issues/69); [RDP #70 historical EDM](https://github.com/tclare95/river-data-platform/issues/70).
- [isHPPOpen current consumer service](../libs/services/waterQualityService.js), [indicator](../libs/waterQualityIndicator.js), [alert evaluation](../libs/services/colwickAlertsService.js), [water-quality page](../app/waterquality/page.js), [Sewage Map compatibility](SEWAGE-MAP-COMPATIBILITY.md).
- [Legacy Node membership/provider reads](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs), [main collector](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs), [SQS worker](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoWorker.mjs), [archive](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/csoArchival.mjs).

**Review-only.** This document does not authorise implementation, any collection/alert/write changes, AWS/Vercel operations, import, deployment or authoritative source switch.
