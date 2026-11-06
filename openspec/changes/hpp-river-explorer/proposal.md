# Proposal: Holme Pierrepont River Explorer using RDP River Tracer (#114)

**Status:** proposed isHPPOpen consumer feature; specification/documentation only. **Tracking:** [isHPPOpen #114](https://github.com/tclare95/isHPPOpen/issues/114). **Producer:** [RDP River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47), whose [canonical product specification](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/river-network-routing) remains RDP-owned.

## Why

isHPPOpen explains the level, opening status and CSO context at Holme Pierrepont (HPP), but visitors cannot explore **where the Trent at HPP comes from or where it flows**. RDP now has a river-network read contract for a coordinate: locate a mapped river reach, trace upstream/downstream, return readable river summaries and GeoJSON, and show catchment evidence where available. isHPPOpen can turn that platform capability into a useful, site-specific public experience.

The currently implemented River Tracer API consists of signed first-party `GET /v1/river/locate`, `/v1/river/upstream` and `/v1/river/downstream`, plus release-scoped links. The user reports it is available in production. The RDP implementation documentation still describes its independently gated release and an unresolved ORN network redistribution licence. Consumer readiness must therefore be **verified**, not inferred from code or this proposal.

## First useful outcome

A visitor opens an HPP-focused River Explorer and can:

- See HPP's reviewed point on the **River Trent**, with the matched river and any meaningful snap offset.
- Switch between an **upstream** view (the connected rivers feeding HPP, named tributaries/main stem and any supported catchment polygon/area) and **downstream** (the route from HPP towards the tidal Humber, readable named river progression and route length).
- Explore the route on a map **and** read an equivalent understandable summary without relying on map interaction.
- Recognise when the network is partial, a match is ambiguous, data is missing, or a response is too large. Routes and statistics are never silently represented as complete.
- Follow a clear link to the existing water-quality page, without conflating static river connectivity with current wastewater pollution or HPP opening status.

Keep the first release anchored to HPP; optional click-to-trace for another river location can be separately added after the fixed-site experience is proven. The public feature is **consumer UX**, not a new generic RDP portal or public API.

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

- **RDP owns** river dataset, reach matching, route/catchment semantics, version and upstream GeoJSON contract. isHPPOpen owns the HPP anchor, interpretation, user interface and client-side/public presentation.
- **Existing water-quality remains untouched.** The legacy Sewage Map information-point `properties.CSOs` relationship, Mongo CSO status, calibrated water-quality indicator, subscriber alerts, HPP status and scraper operation do not change in this slice.
- River connectivity does **not** predict pathogen concentration, travel time, dilution, pollution presence or paddling safety. An upstream river is not itself evidence of an upstream CSO discharge.
- No new provider collection, automatic outfall polling or CSO membership changes. Future reviewed HPP outfall-relationship parity/cutover is a distinct change, contingent on an RDP **outfall relationship** read contract and #71/#72 evidence.
- The consumer must not circumvent RDP IAM boundaries. A live first-party API is **not** equivalent to a browser-accessible anonymous endpoint.
- Public distribution of RDP-derived geometry, text and attribution requires confirmed licence permission. Withhold public release of unlicensed material until approved.

## Dependencies and compatibility

- [RDP implementation/response notes](https://github.com/tclare95/river-data-platform/blob/main/docs/RIVER-TRACER.md) and [River Tracer #47](https://github.com/tclare95/river-data-platform/issues/47).
- Existing [isHPPOpen server-only RDP client](../../../docs/RDP-CLIENT-51A.md), [RDP integration boundaries](../../../docs/RDP-INTEGRATION.md) and [water-quality page](../../../app/waterquality/page.js).
- Validate actual production callable routes, release identity, HPP anchor, geometry sizes, errors and licence before enabling a public view.

**No implementation, AWS/Vercel configuration, IAM grant, release, current data-source switch or operational write is authorised by this documentation-only change.**
