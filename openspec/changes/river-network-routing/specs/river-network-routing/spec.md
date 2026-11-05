> **Historical copy — canonical specification relocated.** The maintained requirements, design and acceptance tasks now live in [RDP's river-network-routing OpenSpec](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/river-network-routing) (tracked by [RDP issue #47](https://github.com/tclare95/river-data-platform/issues/47)). This original is retained for traceability to old suite issues/PRs. **Do not edit or implement from this copy.** See [RDP ownership](https://github.com/tclare95/river-data-platform/blob/main/docs/ECOSYSTEM.md). Migration is documentation-only; no release or feature activation is implied.

# River Tracer — network and downstream-impact product requirements

## ADDED Requirements

### Requirement: Versioned river-network evidence
RDP SHALL support an identifiable, attributed and versioned river-network dataset from which connected river reaches and display geometry can be derived. It SHALL distinguish mapped network extent and validated connectivity from unknown, incomplete or ambiguous sections; it SHALL NOT invent links to produce a complete-looking output.

#### Scenario: Reference network changes
- **WHEN** an authorised consumer requests a trace after a network update
- **THEN** the result identifies the effective network version; any previously reviewed outfall-to-reach assignment is not automatically asserted against changed topology without revalidation.

#### Scenario: Network gap
- **WHEN** a downstream route reaches an unverified gap or ambiguous junction
- **THEN** the route is marked incomplete/ambiguous with the known geometry preserved, not marked as having reached the sea.

### Requirement: Point-to-network matching
RDP SHALL resolve a selected geographic point or verified asset location to an appropriate river reach, reporting a meaningful match status and sufficient evidence to inspect uncertainty. Geometric proximity alone SHALL NOT make an ambiguous connection authoritative.

#### Scenario: Nearby river and canal
- **WHEN** an asset coordinate has multiple plausible reaches, including a canal and a natural river
- **THEN** RDP reports candidate or unresolved connections instead of silently choosing the closest line.

#### Scenario: No suitable reach
- **WHEN** a location is outside supported coverage or cannot safely be matched
- **THEN** no authoritative route or upstream/downstream relation is produced for that location.

### Requirement: Downstream route geometry and reach identity
RDP SHALL allow authorised clients to trace from a resolved reach downstream through the network and obtain a bounded, geographically renderable route, including the contributing network/reach identifiers, source/network version, and a clear outcome: mapped coast/tidal boundary, internal termination, incomplete or ambiguous. It SHALL also support upstream traversal so contributing reaches can be discovered for a selected location.

#### Scenario: Point-to-coast trace
- **WHEN** a selected point resolves onto a verified directed network reaching a mapped tidal/coastal terminus
- **THEN** RDP returns the downstream trace geometry and identifies that termination without claiming a modelled pollution arrival time.

#### Scenario: Branch, loop or reversible flow
- **WHEN** there is no single defensible downstream path
- **THEN** RDP reports the alternate/uncertain connectivity within bounded limits; it does not silently choose a definitive pollutant route.

### Requirement: Generate per-outfall downstream impact geometry
For any *verified and confidently mapped* CSO outfall within coverage, RDP SHALL be able to generate **GeoJSON-compatible downstream river geometry** that a map client can render. The geometry SHALL be derived from RDP's network and its own mapping evidence, not from a Sewage Map runtime response.

#### Scenario: Display one CSO's downstream reach
- **WHEN** an authorised consumer requests the mapped downstream corridor for an outfall
- **THEN** it receives valid WGS84 GeoJSON geometry (such as LineString/MultiLineString feature[s]), the canonical outfall identity, network version and a completeness/uncertainty status.

#### Scenario: Outfall cannot be reliably matched
- **WHEN** the outfall lacks usable coordinates, has competing reach matches or falls outside coverage
- **THEN** the output identifies it as excluded/unresolved; it is not presented as having no downstream impact or silently attached to a nearby reach.

### Requirement: Generate map-ready combined downstream-impact layers
RDP SHALL support a **GeoJSON FeatureCollection** suitable for rendering river sections associated with **currently reported active** and, separately, **recently reported completed** CSO events using verified #72 source evidence. Clients SHALL be able to distinguish current, recent, stale/unknown and unmapped states, and shall receive the as-of time and data/network provenance. The product MAY aggregate overlapping routes for rendering, but SHALL preserve an inspectable relationship to contributing outfall/event identities.

#### Scenario: Active spill display
- **WHEN** a mapped outfall has a fresh verified active-status claim
- **THEN** its downstream network geometry may contribute to an active impact layer labelled as *potentially downstream of a reported discharge*, not as measured contamination.

#### Scenario: Recent event window
- **WHEN** a verified completed event ended inside the chosen bounded recent window
- **THEN** its mapped downstream network geometry may contribute to a distinct recent-impact layer, with the window, event evidence and reference time explicit.

#### Scenario: Stale, offline or unresolved event status
- **WHEN** a monitor's status is stale/offline/unknown or an event's end remains unresolved
- **THEN** RDP SHALL NOT silently treat it as not spilling or publish a fresh 'currently affected' claim; its last-known status and uncertainty remain available and separately distinguishable from the fresh active/recent layer.

#### Scenario: Shared downstream segment
- **WHEN** several verified outfalls connect to the same downstream reach
- **THEN** the display layer can identify each relevant contributing outfall/event without duplicate lines causing false counts, or clearly document the aggregation semantics.

#### Scenario: Partial data or large requested area
- **WHEN** a spatial/time selection exceeds available coverage or bounded query limits
- **THEN** RDP returns an explicit partial/paginated or safe rejected outcome; never a silently incomplete feature collection marked complete.

### Requirement: Impact-information queries for selected river locations
RDP SHALL allow a client to select a mapped river point or reach and obtain verified/candidate **upstream CSO identities** based on network connectivity, plus explainable counts and any supported derived metrics. It SHALL be possible to present equivalent information as GeoJSON Point features where suitable for a Sewage Map-style overlay.

#### Scenario: HPP upstream outfalls
- **WHEN** a supported HPP location is queried
- **THEN** RDP identifies verified mapped upstream outfalls, maps them to #71 provider IDs, and flags unverified, missing or ambiguous matches separately.

#### Scenario: Count or density cannot be justified
- **WHEN** connectivity, catchment area or monitored-asset coverage is unknown
- **THEN** RDP does not report an authoritative total or per-square-kilometre density. Any count is scoped to mapped/verified catalogue assets; a density is only supplied with a defined, defensible area denominator and coverage.

### Requirement: Separation from CSO collection and risk interpretation
A network trace or dynamically derived list of upstream outfalls SHALL NOT change #71's explicit polling selection, start collection, automatically publish data, recategorise water quality or change isHPPOpen's existing display/alerts. Routing is connectivity; a displayed potential downstream impact is **not** a claim of pollutant presence, concentration, travel time, exposure or safety.

#### Scenario: Newly discovered upstream CSO
- **WHEN** River Tracer maps a newly discovered verified catalogue outfall upstream of HPP
- **THEN** it can appear as a candidate for review without being polled or added to the operational HPP water-quality assessment automatically.

### Requirement: Source provenance and permission-safe read contracts
Spatial and impact outputs SHALL disclose effective network version, relevant catalogue/event source identity, as-of time, attribution, freshness and known limitations without exposing private object storage. Reads SHALL use a deliberate authenticated first-party access boundary initially, with external/public access a separate reviewed product decision.

#### Scenario: Browser visualises a river route
- **WHEN** a web client needs geometry
- **THEN** the application can obtain display-ready bounded GeoJSON through an authorised application/API boundary without embedding AWS credentials in the browser.

### Requirement: HPP comparison before any replacement
Before changing isHPPOpen's current relationship to Sewage Map, the team SHALL be able to compare RDP-derived HPP upstream outfall IDs and impact-information results with the legacy downstream-impact input on an evidence-recorded basis. Differences SHALL be reviewable and unresolved cases shall not be silently discarded.

#### Scenario: New and absent IDs
- **WHEN** the RDP and legacy selections differ
- **THEN** the comparison distinguishes matches, missing/unknown locations, new candidates, network/identity discrepancies and differences attributable to source or time window. No operational selection or consumer switch follows automatically.

## Non-goals of first release

No hydraulic transport, plume concentration, dispersion/dilution, flow-dependent travel time, proof of pollution, water safety assessment, universal GB completeness, automatic selection/collection, historical spill replay over all dates, externally writable GIS data, public unauthenticated API, new model execution or UI construction. An initial static network/GeoJSON path and a separately gated CSO-event overlay may be delivered in independent increments.
