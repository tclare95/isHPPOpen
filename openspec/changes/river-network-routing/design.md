# Design and evidence notes: River Tracer (#109)

> **Non-normative engineering guidance**, not a mandate for algorithms, route names, data stores, API Gateway paths or additional services. [Product requirements](specs/river-network-routing/spec.md) define observable behaviour. Coding agents should prefer the smallest safe approach that satisfies real HPP/Trent evidence.

## What the existing systems actually do

| Component | Verified repository behaviour | Product implication |
| --- | --- | --- |
| [Legacy scraper `waterQuality.mjs`](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs) | Fetches `downstream_impact/severntrent/severntrent_info_now_incl_48hrs.geojson` from Sewage Map CloudFront; selects closest information **Point** within 250m of fixed NWSC/HPP coordinate; reads `properties.CSOs` into `CSO_IDs`, plus `number_upstream_CSOs` and `number_CSOs_per_km2`. | The legacy dependency is on the **info point layer**, not just live spill-status lines. This is a location-to-outfalls relationship lookup with time-dependent source metadata. Preserve that distinction when comparing outputs. |
| [Sewage Map backend `update_downstream.py`](https://github.com/AlexLipp/sewage-map/blob/main/update_downstream.py) | Calls `get_downstream_geojson(include_recent_discharges=true/false)`; wraps an output MultiLineString as GeoJSON FeatureCollection and projects to WGS84. Separately publishes `get_downstream_info_geojson` Point FeatureCollections. For each company produces current-only and current-plus-48-hour artefacts. | Two product families: **downstream river geometry** for visual overlay and **river-point metadata** for upstream membership. RDP should own equivalent semantics, not merely proxy upstream queries. |
| [Sewage Map frontend](https://github.com/JonnyDawe/UK-Sewage-Map) | Loads downstream-affected river sections as GeoJSON and renders the linework with CSO asset data. Its README warns that the model omits dilution, flow and dispersion. | Use cautious language: *river reaches potentially downstream of reported discharges*, never measured water quality or confirmed contamination. |
| [RDP CSO #71](../cso-asset-catalogue-and-selection/proposal.md) | Verified, versioned provider outfall catalogue and explicit per-stage named ID sets; discovery cannot silently activate polling. | Route mapping may reference exact identities but cannot implicitly expand collection. Outfall coordinates are optional metadata, not guaranteed accurate. |
| [RDP CSO #72](../modernise-cso-data/proposal.md) | Independent source evidence/current status/revised spill interval requirements; offline/stale is not an event end. | Status-aware impact layers should consume verified CSO read semantics. Source freshness, unresolved events and corrections matter; don't implement an alternate CSO state machine in routing. |
| [RDP #69](../observation-read-api/proposal.md) | Separate AWS_IAM authenticated first-party Lambda reads with bounded responses and stage identity checks. | Keep first version first-party and separately approved. GIS data may have different caching/storage/geometry read needs; reuse host where practical, not necessarily observation DTOs. |

Sewage Map's public code is an **example of the product concept**, not automatically a licensable input dataset, a definitive impact model, or a required wire schema. Confirm all relevant output/provider licensing and current published behaviour before compatibility claims.

## Reference-network investigation

Candidates: [OS Open Rivers](https://www.ordnancesurvey.co.uk/products/os-open-rivers) (national, refreshed, flow-directed links/nodes but not perfectly connected) and [OpenRiversNetwork](https://www.openrivers.net/) (topology-corrected, based on older OS data, with canal/loop simplification). OpenRiversNetwork's site/FAQ state different licence terms (OdBL vs OGL) and should be reconciled with downloadable metadata/maintainers before committing to distribution or attribution.

Evidence questions:
- Can a river section be traced from the HPP area to a meaningful downstream tidal/coastal terminus with correct directed connectivity?
- How are the Trent, tributaries, canals, weirs, artificial bypasses, bifurcations and tidal reaches represented, and what happens at graph gaps?
- Does the candidate source include enough identifiers, direction and WGS84 geometry to render as linework and support consistent versioned outfall relationships?
- How accurately do actual verified Severn Trent outfall coordinates map to the *receiving watercourse*? A provider coordinate may represent a monitor/asset and not the exact discharge point.
- What coverage/size/latency for a single route, a large upstream tree, and a whole-catchment active impact layer is reasonable? Measure before imposing arbitrary caps.
- Can offline/precomputed directed graphs and derived route geometry eliminate repeated heavy spatial processing while keeping source version/updates auditable?

Prefer an **offline prepared, versioned network** and bounded per-query/derived outputs; no external live GIS dependency is required. Evaluate a spatial database, indexed static assets or lightweight in-process graph against actual workload. Do not prescribe PostGIS, Neptune, graph DB or a new service by default. Keep physical network reference data distinct from CSO events and scalar readings.

## Required outputs and potential contract shapes

The product must support BOTH:

1. **Static reach-based geometry:** trace from a point or named outfall, upstream or downstream; render as GeoJSON LineString/MultiLineString in WGS84, with network/source version and match/termination status.
2. **Dynamic (status-aware) downstream-impact GeoJSON:** derive a geographically bounded overlay for CSOs with fresh verified active state, and optionally a separately identifiable recent-completed window (Sewage Map currently distinguishes current from current-plus-48-hour output). This is a *potential connectivity footprint* conditional on reported discharges, not a plume simulation.
3. **Information layer:** respond at a selected river point with upstream outfall canonical/provider IDs, network-derived counts (scoped to verified mapped catalogue coverage), and any defensible density if catchment area is defined; optionally publish map-ready GeoJSON Points.

A sensible first-party API may expose separate trace, impact-overlay and info queries rather than making every request return a large national FeatureCollection. **Exact route paths and DTOs are implementation decisions** and must be reviewed against existing IAM route allowlists and request/response limits. For RDP playground maps, static/publicly distributable geometry may be cached independently from dynamic status overlays; never expose private storage or IAM credentials to a browser.

### Illustrative GeoJSON output (NOT a fixed v1 contract)

This example is deliberately synthetic; coordinates and identities are placeholders, not real river segments or provider IDs. Clients should be able to draw geometry directly, inspect source attribution and status, and distinguish complete from partial evidence:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[-1.11, 52.94], [-1.10, 52.945], [-1.09, 52.95]]
      },
      "properties": {
        "kind": "potential-downstream-reach",
        "state": "reported-active",
        "contributingOutfalls": ["example-provider:outfall-001"],
        "networkVersion": "example-network-v1",
        "coverage": "illustrative"
      }
    }
  ]
}
```

In actual output, feature/collection metadata should be stable and versioned; use a documented mechanism for collection-wide `asOf`, source evidence/freshness, window and completeness, with sensible mapping to GeoJSON `properties` / top-level foreign members. When several outfalls connect to the same reach, avoid rendering duplicates as independent contaminated segments and retain an inspectable contributing-ID set. If the matching graph or event feed is partial, response metadata must expose that—GeoJSON validity alone is not evidence of full coverage.

### Temporal semantics

Potential overlay inputs:
- **Static path for a given outfall:** no implication that the outfall is currently discharging.
- **Active reported:** requires a sufficiently fresh verified active current-state claim; show source observation time and query as-of.
- **Recent completed:** explicitly bounded lookback based on verified event end, separate from active; support a 48-hour compatibility/use-case view without treating 48 hours as a universal fixed policy.
- **Stale/offline/unknown/unresolved:** separate uncertainty/last-known representation where supported; never silently recategorise as 'not spilling'. A case with an unresolved event end must not be invented as a completed recent event.
- **Event correction:** revised event time/status should change the derived overlay on future reads without erasing the underlying #72 source evidence.

Take care that 'potentially downstream of an active/recent outfall' is **not** proof of contamination at a time or point. Water-quality assessment and health advice are not part of the routing product.

## HPP/Trent comparator and handoff

A small offline parity report should record:
- legacy reference URL, captured source timestamp/availability and selected information point/distance;
- versioned reference river data and candidate outfall catalogue/source identity;
- HPP selected network reach and match decision;
- intersecting canonical ID sets: shared, RDP-only, legacy-only, malformed/unmapped, ambiguous;
- divergent reasons: source coverage, unmatched location, provider identity mismatch, historical/recent/active status rules, network topology.
- explicit operator review and go/no-go before any proposed #71 named selection change or consumer cutover.

A derived route should inform operator proposals for selection, **never** implicitly alter the #71 configured selection or #72 active polling. The isHPPOpen risk indicator continues to use its current agreed inputs until independently assessed against a reviewed replacement.

## Delivery guidance

1. Source/licence and real HPP network evidence; minimal fixture-based point/reach and route proof, no live calls or AWS.
2. Single resolved-route GeoJSON and upstream point query with honest uncertainty; source/version/coverage evidence.
3. Verified catalogue outfall-to-reach mapping and reproducible comparison against current Sewage Map HPP IDs.
4. Per-outfall downstream geometry and bounded, optionally status-aware FeatureCollection from #72 event reads; distinguish static/active/recent/unknown.
5. Separately approved first-party read integration and application visualisation, then controlled side-by-side HPP migration if parity evidence supports it.

These are suggested slices, not strict PR boundaries. Keep runtime activation, external network downloads, production resources and legacy switching independently reviewed.
