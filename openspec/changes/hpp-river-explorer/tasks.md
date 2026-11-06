# HPP River Explorer — acceptance outcomes (#114)

All tasks are **unstarted**. They express user-visible outcomes and verification evidence, not a required file layout, algorithm, number of PRs or AWS deployment sequence.

## First usable HPP experience

- [ ] Verify actual production River Tracer locate/upstream/downstream availability from isHPPOpen's server-side caller, and document concrete successful and failure fixtures. Do not assume anonymous browser access or broaden IAM without a separately reviewed change.
- [ ] Review the HPP-on-Trent starting coordinate against the returned reach name, candidates and snap offset; record a repeatable check for network release changes and ambiguous positions.
- [ ] Resolve/record redistribution permission and required attribution for public ORN-derived content. If not resolved, do not publish restricted map or summary data.
- [ ] **Extend the existing `/waterquality` map and page**, rather than create a parallel water-quality dashboard: optional upstream/downstream river geometry, readable named-river summary, qualified catchment and source provenance; preserve its marker/time-window/chart/indicator interactions.
- [ ] Preserve unknown/partial/unmatched states; give useful textual or `geometry=none` fallback for large responses, unavailable geometry, map failure, retired release URL and upstream service failure.
- [ ] Validate fixture-based response adaptation (locate JSON versus trace FeatureCollection), source release consistency, bounded/cached requests, error sanitisation and stage separation. No credential or general-purpose proxy exposed to browser clients.
- [ ] Regression-test current/6/24/48-hour CSO markers, 24-hour/5-day density chart, freshness/unknown handling, calibrated indicator, water-quality alert evaluator and HPP status **alongside** the new optional routing layer; document tested UX, source caveats and release decision.

## Separately gated replacement of the Sewage Map relationship source

- [ ] Capture the legacy HPP Sewage Map information-point baseline including selected point/distance, provider IDs, upstream count, density, timestamps and the real density/time-window meaning.
- [ ] Generate candidate HPP upstream IDs from a verified RDP #71 catalogue and #47 network/catchment data; review linked, catchment-only, ambiguous and unmapped outfalls and record attributed decisions and versioning.
- [ ] Produce a reviewed effective HPP membership that can be consumed **without runtime Sewage Map**. Prefer an approved generated artifact if sufficient; do not make a new RDP online endpoint a prerequisite without a demonstrated consumer need.
- [ ] Compare source sets and material metrics; explicitly decide legacy-only/new/unresolved assets and count/area/activity-density interpretation. Test impact on the existing three-hour rolling CSO indication, 24-hour/5-day chart, August 2026 calibration thresholds and subscribed water-quality alerts, including null/missing versus genuine zero.
- [ ] Validate the transitional Severn Trent status/polling and web/alert contracts against the newly reviewed membership without automatic #71 selection changes or a second competing authoritative writer.
- [ ] Demonstrate a separately authorised, monitored, reversible cutover in which no runtime Sewage Map call is required and outages never turn into empty upstream sets, false zero activity or inadvertent alert emission.
- [ ] Keep later RDP-native #72 status/history migration and full scraper retirement scoped to their existing owners (#68/#72), rather than requiring all CSO infrastructure to move in this slice.

## Separately scoped later opportunities

- [ ] Evaluate opt-in tracing from another selected river point, only after the HPP default has demonstrated reasonable map usability and error handling. This is **not a first-release prerequisite**.
- [ ] When RDP exposes reviewed dynamic outfall relationships/impact layers and #72 status/events, consider a further platform-native CSO read migration; it is not required for the separately reviewed Sewage Map membership-source cutover.

**Specification PR only:** no implementation, deployment, new IAM rights, public API exposure, source switch, CSO collection changes or production data writes.
