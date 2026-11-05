# Proposal: River Tracer — versioned river-network routing and CSO connectivity (#109)

## Why

The legacy isHPPOpen scraper currently obtains HPP-related `CSO_IDs` through Sewage Map downstream-impact GeoJSON. Although RDP's [CSO catalogue #71](https://github.com/tclare95/isHPPOpen/issues/71) deliberately removes that **runtime provider-selection dependency**, RDP still lacks its own evidence-backed answer to a different question: *which outfalls are hydrologically upstream of a location?*

River Tracer makes this a reusable **spatial platform capability** rather than hard-coded HPP business logic or a new third-party live routing dependency. It also enables RDP playground users to drop a pin, follow a river towards the coast, inspect contributing upstream reaches and select related observations or CSO activity.

The [RDP product vision](https://github.com/tclare95/river-data-platform/blob/docs/product-vision-2026/docs/PRODUCT_VISION.md) places River Tracer in the first wave of independent platform work.

## Product outcome

A first-party reader can supply a point or known mapped location and get a bounded, attributable network result:

- an identified river reach (or explicit no-match/ambiguous candidate outcome);
- the connected **downstream route** to a mapped coast/tidal/terminal boundary, with route geometry, relevant distance if supported, and completeness/uncertainty;
- the **upstream contributing network** for that location, with bounded geometry/identifiers;
- mapped, verified **CSO outfalls that are hydrologically upstream/downstream**, including clear distinction between candidate, reviewed and unresolved mappings;
- source dataset identity/version, source licence/attribution, and enough provenance to reproduce or review the result.

Routing reports **connectivity**, not travel time, pollutant transport, concentration, risk, or water safety. Two assets being geographically nearby never proves an upstream relationship. An uncertain/partial route must not be presented as complete.

## First useful slice and users

Start with **the Trent/HPP area** as a validated case, not a mandate to build a full GB production service in one pass. A user, operator or authorised app can:

1. Select a point on the Trent and trace upstream/downstream, with a meaningful failure/ambiguity outcome.
2. Match a reviewed subset of Severn Trent outfall coordinates and provider IDs to network reaches, without guessing for missing or conflicting locations.
3. Retrieve candidate outfalls upstream of HPP, with explainable route/link evidence.
4. Compare that result with the current Sewage Map-derived HPP selection: common, newly suggested, absent, ambiguous/unmapped and reason for divergence.
5. Review mismatches **before** proposing any polling selection or isHPPOpen consumer change.

An RDP playground can later visualise and share the same network results. That UI is not a prerequisite for the first first-party read capability.

## Domain boundaries and decisions

- **Routing/topology:** owns versioned river-network reference data, point-to-reach resolution, connectivity/traces, and qualified asset-to-reach relationships.
- **CSO #71:** owns verified outfall catalogue identities and independently reviewed per-environment *collection selections*. An upstream relationship **does not** activate polling, and catalogue refresh does not implicitly route/match all newly discovered outfalls.
- **CSO #72:** owns status evidence and spill events, not watercourse connectivity or pollution impact.
- **isHPPOpen:** remains owner of HPP-specific water-quality calibration, presentation and any reviewed selection/consumer migration. No automatic risk reclassification.
- **Existing first-party API #69 / future #78:** follow existing controlled authenticated reads initially. Do not turn a spatial endpoint into an anonymous public API or put AWS credentials in browsers.
- **Geographic data:** may be derived from approved, attributed offline datasets; no required live third-party routing dependency. Confirm licence, quality and intended reuse **before** accepting an authoritative network release.

## Candidate data and investigation

Review [OS Open Rivers](https://www.ordnancesurvey.co.uk/products/os-open-rivers), a maintained generalised, flow-directed GB link/node network, and [OpenRiversNetwork](https://www.openrivers.net/), a topology-corrected derivative with catchment context. The latter may simplify first implementation but may omit or reshape canals/loops. The source's own licence statements should be reconciled against download metadata and obligations before redistribution or service use.

Evaluate real HPP/Trent topology, gaps, direction, branch points, tributaries, tidal boundaries, coordinate accuracy and mapping to the #71 outfall catalogue. **Neither dataset choice nor any particular graph engine/storage is dictated by this product spec.**

## Rollout and interoperability

- Preserve existing live scraper/CSO selection, water-quality indicator and downstream consumers until evidence-backed, independently approved change.
- Make network/version transitions reviewable, including previously mapped outfalls that become disconnected or ambiguous on a revised dataset.
- Allow a safe side-by-side HPP comparison and an explicit go/no-go decision for any future selection migration, including rollback and discrepancy handling.
- Keep stage/prod isolation and controlled release posture; this change introduces no automatically enabled polling or producer action.

## Scope boundaries

**Included initially:** versioned reference network, geospatial match with uncertainty, bounded upstream/downstream connectivity, verified-CSO relationship query, diagnostics, HPP parity evidence, first-party read contract.

**Deferred:** full GB operational completeness, dynamic flow/hydraulic routing, pollution plume propagation, contaminant arrival time, public hazard/safety assessment, automatic site membership or polling activation, user-edited river networks, streaming GIS updates, model execution and map UI construction.

The normative behaviour is in [capability requirements](specs/river-network-routing/spec.md), alternative implementation choices and evidence questions in [design](design.md), and uncompleted acceptance tasks in [tasks](tasks.md).

**Documentation only:** no code, datasets downloaded/processed, live probes, cloud writes, API deployment, collection selection changes or consumer cutover are authorised by this proposal.
