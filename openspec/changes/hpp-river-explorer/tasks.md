# HPP River Explorer — acceptance outcomes (#114)

All tasks are **unstarted**. They express user-visible outcomes and verification evidence, not a required file layout, algorithm, number of PRs or AWS deployment sequence.

## First usable HPP experience

- [ ] Verify actual production River Tracer locate/upstream/downstream availability from isHPPOpen's server-side caller, and document concrete successful and failure fixtures. Do not assume anonymous browser access or broaden IAM without a separately reviewed change.
- [ ] Review the HPP-on-Trent starting coordinate against the returned reach name, candidates and snap offset; record a repeatable check for network release changes and ambiguous positions.
- [ ] Resolve/record redistribution permission and required attribution for public ORN-derived content. If not resolved, do not publish restricted map or summary data.
- [ ] Present a site-discoverable, accessible, responsive upstream/downstream explorer: route map where available, readable named-river summary, supported catchment area/polygon and explicit provenance.
- [ ] Preserve unknown/partial/unmatched states; give useful textual or `geometry=none` fallback for large responses, unavailable geometry, map failure, retired release URL and upstream service failure.
- [ ] Validate fixture-based response adaptation (locate JSON versus trace FeatureCollection), source release consistency, bounded/cached requests, error sanitisation and stage separation. No credential or general-purpose proxy exposed to browser clients.
- [ ] Demonstrate that HPP status, existing water-quality indicators, Mongo/legacy CSO memberships, CSO map/alerts and scraper schedules remain untouched; document tested UX, source caveats and release decision.

## Separately scoped later opportunities

- [ ] Evaluate opt-in tracing from another selected river point, only after the HPP default has demonstrated reasonable map usability and error handling. This is **not a first-release prerequisite**.
- [ ] When RDP exposes reviewed outfall relationship/impact data, prepare a **separate** isHPPOpen parity and CSO cutover OpenSpec. No automatic Sewage Map replacement or CSO selection is authorised by this change.

**Specification PR only:** no implementation, deployment, new IAM rights, public API exposure, source switch, CSO collection changes or production data writes.
