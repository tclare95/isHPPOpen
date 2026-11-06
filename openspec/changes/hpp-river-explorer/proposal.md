# Proposal: Holme Pierrepont River Explorer using RDP River Tracer (#114)

**Status:** proposed isHPPOpen consumer feature; specification/documentation only. **Tracking:** [isHPPOpen #114](https://github.com/tclare95/isHPPOpen/issues/114). **Producer:** [RDP River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47), whose [canonical product specification](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/river-network-routing) remains RDP-owned.

## Why

**Existing product baseline (verified on isHPPOpen `main`, 6 November 2026):** `/waterquality` is already a public HPP water-quality dashboard. It contains an upstream CSO **point-marker map** with current/6/24/48-hour event filters, status summary cards, a 24-hour/5-day density history chart, a calibrated indication combining recent CSO density and four-hour river rise, source-health notices and a link to existing water-quality alerts. The homepage already links to this dashboard. Its `csoMap`, `csoChart`, `waterQualityService`, `waterQualityIndicator` and alert service have relevant tests. These are **implemented baseline**, not deliverables of this change.

What is missing is **the actual river-network context** behind those points, and the elimination of the Sewage Map information-point dependency that chooses the current HPP CSO set and density. The existing point map is not hydrological routing: it plots selected asset coordinates and deliberately omits stale/offline locations from the plotted layer.

isHPPOpen explains the level, opening status and CSO context at Holme Pierrepont (HPP), but visitors cannot explore **where the Trent at HPP comes from or where it flows**. RDP now has a river-network read contract for a coordinate: locate a mapped river reach, trace upstream/downstream, return readable river summaries and GeoJSON, and show catchment evidence where available. isHPPOpen can turn that platform capability into a useful, site-specific public experience.

The currently implemented River Tracer API consists of signed first-party `GET /v1/river/locate`, `/v1/river/upstream` and `/v1/river/downstream`, plus release-scoped links. The user reports it is available in production. The RDP implementation documentation still describes its independently gated release and an unresolved ORN network redistribution licence. Consumer readiness must therefore be **verified**, not inferred from code or this proposal.

## First useful outcome: enhance the existing water-quality dashboard

A visitor opens the existing `/waterquality` experience and can **optionally** explore its HPP river network on or alongside the existing map, without losing the current activity markers, time-window controls, chart, indication or alerts. The visitor can:

- See HPP's reviewed point on the **River Trent**, with the matched river and any meaningful snap offset.
- Switch between an **upstream** view (the connected rivers feeding HPP, named tributaries/main stem and any supported catchment polygon/area) and **downstream** (the route from HPP towards the tidal Humber, readable named river progression and route length).
- Explore the route on a map **and** read an equivalent understandable summary without relying on map interaction.
- Recognise when the network is partial, a match is ambiguous, data is missing, or a response is too large. Routes and statistics are never silently represented as complete.
- Keep the existing current/recent CSO point-marker and density experience intact while distinguishing the **static** hydrological route overlay from **time-sensitive** provider events and HPP opening status.

**Do not build a second water-quality dashboard, duplicate a CSO map, reinvent filtering/charting/calibration/alerts, or require a new standalone page.** Reusing the existing Leaflet map and a concise collapsible/linked river-route explanation is the preferred first product expression. A separate deep-dive route can be added later only if real usability demands it. Keep the first release anchored to HPP; opt-in tracing from other locations is optional and later. This is consumer UX, not a new generic RDP portal or public API.

## Second outcome: replace Sewage Map at runtime

The existing scraper depends on Sewage Map's **information-point GeoJSON**, not just a river map. It chooses the nearest information point to HPP (within 250 m) and consumes `CSOs`, `number_upstream_CSOs` and `number_CSOs_per_km2`. Those IDs drive Severn Trent status work; the summary and density feed the current site view and historical water-quality calibration.

The HPP consumer SHOULD migrate to a **reviewed RDP-derived site membership and metric source**, ultimately making **no Sewage Map runtime request**. This is a second, independently approved delivery slice of the same consumer change—not a prerequisite for publishing an independently useful river map.

- Resolve HPP's upstream CSO identities through the verified #71 outfall catalogue and #47 network/catchment evidence, recording confidently linked, catchment-only/unlinked, ambiguous, unavailable and excluded cases.
- Compare an evidence-captured Sewage Map baseline with RDP membership and investigate each significant difference (source coverage, asset coordinates, ID matching, geographic extent and active/recent status semantics). Do not automatically add candidates to operational polling.
- Produce a **reviewed, versioned HPP membership** with stable canonical/provider IDs and source/network versions. RDP already has offline candidate matching and catchment commands: a reviewed generated artifact could suffice **without a new online API**. A first-party upstream-outfalls endpoint is the natural later reusable product capability.
- Reconcile the precise meaning and denominator of `number_upstream_CSOs` and `number_CSOs_per_km2`. Static upstream catalogue membership is not the same thing as time-varying active/recent activity density; do not silently feed new semantics into historical charts or calibrated alerts.
- Introduce the selected new source behind an independently reversible source switch, with parity evidence and explicit treatment of history continuity. Keep the existing status/alert/public data contract until changes are deliberately approved.

**Important:** removing the *Sewage Map relationship lookup* does not require all CSO event/status reads to have moved to RDP. The current scraper may still fetch Severn Trent statuses for a reviewed, fixed selection during the transition. Retiring those remaining scraper responsibilities belongs to [#68](https://github.com/tclare95/isHPPOpen/issues/68) and RDP [#72](https://github.com/tclare95/river-data-platform/issues/72).

## Boundaries

- **RDP owns** river dataset, reach matching, route/catchment semantics, version and upstream GeoJSON contract. isHPPOpen owns the HPP anchor, interpretation and enhancement of its **existing** `/waterquality` interface. The current CSO marker/status layer remains separately sourced until an approved migration.
- **Separate release gates.** The River Explorer map does not alter the current CSO/water-quality pipeline. The separately approved Sewage Map source migration may change HPP membership and metrics only after reviewed evidence, calibration/compatibility checks and rollback planning; HPP status and unrelated alerts remain unaffected.
- River connectivity does **not** predict pathogen concentration, travel time, dilution, pollution presence or paddling safety. An upstream river is not itself evidence of an upstream CSO discharge.
- No automatic provider collection, outfall polling or site membership changes from a trace or catalogue refresh. A reviewed HPP membership artifact from existing RDP capabilities is permitted for the independently approved Sewage Map cutover; a reusable online outfall relationship API is an enhancement, not necessarily a prerequisite.
- The consumer must not circumvent RDP IAM boundaries. A live first-party API is **not** equivalent to a browser-accessible anonymous endpoint.
- Public distribution of RDP-derived geometry, text and attribution requires confirmed licence permission. Withhold public release of unlicensed material until approved.

## Dependencies and compatibility

- [RDP implementation/response notes](https://github.com/tclare95/river-data-platform/blob/main/docs/RIVER-TRACER.md), [River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47), and the [RDP CSO catalogue/selection spec](https://github.com/tclare95/river-data-platform/blob/main/openspec/changes/cso-asset-catalogue-and-selection/proposal.md).
- Existing [isHPPOpen server-only RDP client](../../../docs/RDP-CLIENT-51A.md), [RDP integration boundaries](../../../docs/RDP-INTEGRATION.md) and [water-quality page](../../../app/waterquality/page.js).
- Validate actual production callable routes, release identity, HPP anchor, geometry sizes, errors and licence before enabling a public view.

**No implementation, AWS/Vercel configuration, IAM grant, release, current data-source switch or operational write is authorised by this documentation-only change.**
