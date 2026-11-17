# Wave C — product design considerations

The capabilities are intentionally specified by user outcomes, not component structure, charts, routes, algorithms, page-size settings or a PR plan. Implement the smallest useful slice of each, then expand where evidence already supports it.

## C1 — Event comparison
Reuse the existing Colwick event index and detail APIs, charts, eligibility and limitations. Comparing two **Colwick events** is the first usable slice and does not require another gauge's historical import. Later multi-gauge context is optional and already constrained by `historical-river-events`: stations have different datums/parameters and should not be shown as interchangeable depths. Event IDs can shift after corrections; preserve current event-link resolution behaviour.

## C2 — Rainfall context
RDP now collects six identified rainfall measures for the predictor. They are **15-minute period totals**, not instantaneous readings. The underlying flood-monitoring telemetry is not independently quality flagged; source freshness has lag, gaps and potentially corrected history. Not all interval label conventions are verified for all gauges or periods: only attach rainfall to a specific physical time window where RDP provides verified boundaries. Do not quietly sum unverified intervals as if they were complete, or assume a rainfall spike caused a downstream river response. Keep model precipitation forecasts separate from observed rainfall.

## C3 — Current conditions
Extend the homepage/Trent dashboard rather than build a new status system. The authoritative HPP operational status remains distinct from observed level thresholds, event restrictions and model forecast. A forecast rise is not an announced future HPP closure. Make freshness and timestamp as easy to see as the number. Different gauges may use different units/datum and should be presented independently rather than plotted on a misleading shared absolute-height scale.

## C4 — Outfall detail
A focused panel or route is acceptable. Use canonical provider/outfall identity for deep links, not just a map point: multiple monitors can share a location. Reuse existing selected membership, status, event details, revisions, collection coverage and route overlay. Distinguish monitored/selected/confirmed upstream status from inferred candidate relationships. River Tracer demonstrates network connectivity, not measured pollution, travel time or guaranteed site safety.

## Rollout and dependencies
All RDP reads stay server-side under existing trusted credentials. Avoid expensive unbounded multi-outfall or multi-month reads per page; use bounded, cache-appropriate queries and the existing signed-client pattern. If a critical producer capability is absent, explicitly isolate that dependency and deliver independent portions; do not turn Wave C into an unapproved cross-repository infrastructure project.

Wave A and B may change component layouts, alerts and admin code; review current main before modifying shared files. No live source switches, credentials, writer changes, new collection jobs or AWS deployments are authorized by this document.
