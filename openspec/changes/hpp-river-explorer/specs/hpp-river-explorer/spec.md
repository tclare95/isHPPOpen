# HPP River Explorer — product requirements

## ADDED Requirements

### Requirement: A reviewed HPP river location anchors the experience

isHPPOpen SHALL offer a clearly identified Holme Pierrepont / River Trent starting point whose RDP river-network match has been reviewed. It SHALL show the mapped river identity and meaningful source-to-route offset, and SHALL NOT silently choose an adjacent drain, canal or unrelated watercourse to make a route appear available.

#### Scenario: HPP matches the expected Trent reach
- **WHEN** a visitor opens the River Explorer and the configured HPP location matches an approved River Trent reach
- **THEN** the experience identifies HPP as the starting location, uses that match for both directions and presents the route evidence without claiming the snapped point is identical to the real-world site.

#### Scenario: HPP anchor changes or becomes uncertain
- **WHEN** a new RDP release moves the match, changes the river identity, returns multiple plausible reaches or cannot resolve the configured anchor
- **THEN** isHPPOpen does not silently keep showing a plausible but unverified route; it displays an appropriate unavailable/uncertain state until the anchor can be reviewed.

### Requirement: Visitors can understand the upstream and downstream river network

isHPPOpen SHALL present a selectable upstream/downstream view for HPP using the RDP-provided network relationship and geometry where supported, accompanied by a human-readable account of what it shows. Upstream SHALL distinguish the contributing mapped river network from any source catchment polygon; downstream SHALL show a route towards the reported termination without inventing a path through unmapped gaps.

#### Scenario: Downstream tracing succeeds
- **WHEN** the downstream response for the verified HPP point includes mapped geometry and a readable river progression
- **THEN** the user can follow the route on a map and in text, including the available river names, distance and reported endpoint/completeness.

#### Scenario: Upstream tracing succeeds
- **WHEN** the upstream response includes river reaches, named tributaries or main-stem information
- **THEN** the user can see the connected network and a navigable/textual summary of key named rivers, without confusing tributary branches with a single direct route.

#### Scenario: Catchment evidence is absent or displaced
- **WHEN** RDP lacks a published catchment at the queried sample, substitutes a downstream pour point, or reports geometry/coverage caveats
- **THEN** isHPPOpen identifies the catchment as absent or qualified, shows its area only when supported, and does not imply an exact hydrological boundary at HPP.

### Requirement: Completeness, provenance and uncertainty remain honest

The Explorer SHALL respect RDP's matching status, release/version, source attribution, route completeness/termination and caveats. Missing or unverified reaches SHALL NOT be drawn as connected. It SHALL NOT present connectivity, catchment area or an active CSO as measured contamination, travel time or a safety assessment.

#### Scenario: Partial or unresolved trace
- **WHEN** a route ends due to a network gap, limit, unknown flow, extent boundary or other incomplete condition
- **THEN** the visible result identifies that it is partial and does not label the route complete to the sea/source.

#### Scenario: Ambiguous, unmatched or out-of-coverage location
- **WHEN** RDP returns `Ambiguous`, `NoMatch`, `OutOfCoverage` or an unsupported response
- **THEN** the product explains why a route cannot be shown rather than guessing at the correct river.

#### Scenario: Dataset attribution
- **WHEN** network-derived map geometry, catchment or named-route data is displayed to the public
- **THEN** the applicable source/version, attribution and relevant limitations are available to the visitor, and publication is blocked if redistribution permission has not been confirmed.

### Requirement: Maps have a usable text alternative and robust failure states

The Explorer SHALL work across common mobile and desktop viewports, offer a legible distinction between direction/route and optional catchment, and let a visitor understand the key result without using the map. Geometry is an enhancement, not a prerequisite for a useful answer.

#### Scenario: Large route response or map failure
- **WHEN** RDP returns an oversized-geometry error, the map fails to load, or a device cannot render the geometry
- **THEN** the user can still obtain the summary and available non-geometry evidence where the service supports it; the missing map is clearly indicated.

#### Scenario: Empty or failed upstream read
- **WHEN** the requested direction cannot be served due to authentication, throttling, storage/integrity, timeout or network failure
- **THEN** the visitor sees a bounded, recoverable unavailable state, not a fabricated route or a site-wide failure.

### Requirement: The RDP integration remains a narrow, safe consumer

The River Explorer SHALL consume RDP through trusted isHPPOpen server-side infrastructure with the existing stage-separated federation and least-privilege read model. No AWS credentials, signed request internals or unconstrained arbitrary upstream proxy SHALL be exposed to the browser. Repeated public viewing SHALL use bounded and appropriately cached requests.

#### Scenario: Browser opens the River Explorer
- **WHEN** a public visitor requests the HPP route
- **THEN** only display-safe, reviewed data is served to the browser; the visitor does not authenticate directly to the RDP AWS_IAM endpoint.

#### Scenario: Current release changes
- **WHEN** a release-scoped URL becomes unavailable or RDP publishes a newer network
- **THEN** the consumer re-resolves the HPP anchor as needed and does not silently combine geometry or summaries from incompatible releases.

### Requirement: Existing HPP operational and water-quality behaviour is unchanged

The new River Explorer SHALL be informational and independently degradable. It SHALL NOT change HPP open/closed decisions, river-level reads, CSO membership/polling, spill-status calculations, density history, calibrated water-quality indication, alerts, or legacy source selection.

#### Scenario: River Tracer is unavailable while HPP data is healthy
- **WHEN** River Tracer fails
- **THEN** existing status, forecast, water-quality page and alerts continue their established behaviour without using route failure as a new operational signal.

#### Scenario: User follows a link to water-quality data
- **WHEN** the visitor moves from the river route to existing CSO activity information
- **THEN** the two views clearly distinguish static geographic connectivity from fresh provider event/status evidence and do not suggest that every plotted CSO is verified upstream by River Tracer.
