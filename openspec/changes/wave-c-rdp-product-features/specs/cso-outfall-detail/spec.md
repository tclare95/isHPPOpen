# Capability: Focused CSO outfall details

## ADDED Requirements

### Requirement: Explore a particular outfall
Visitors SHALL be able to open a focused, revisitable view of a specific relevant CSO outfall from the existing water-quality map or event history.

#### Scenario: Selecting an outfall
- **WHEN** a visitor selects a map marker or recorded event **THEN** the detail view identifies the canonical outfall/monitor, relevant receiving watercourse or location when published, and its relationship to the HPP scope.
- **WHEN** multiple monitors share coordinates **THEN** a selection or deep link resolves to the intended canonical identity, not merely the shared pin.
- **WHEN** the visitor shares or revisits the outfall selection **THEN** the route or URL preserves its identity without embedding private RDP credentials.

### Requirement: Current and historical evidence together
- **WHEN** usable status and history are available **THEN** the detail shows reported current status and observation/source age, recent/historical spill events, ongoing and corrected event information, and monitoring coverage where supported.
- **WHEN** status is stale, offline, not selected, unknown or unreadable **THEN** the view does not claim the monitor is clear or the period spill-free.
- **WHEN** event evidence is corrected or its end is unresolved **THEN** the details preserve stable event identity, corrections and uncertainty rather than inventing a precise ending.

### Requirement: Explain downstream connection honestly
- **WHEN** a verified downstream River Tracer route is available for the selected outfall **THEN** it can be displayed in the existing map experience, with route/version/source context and a link back to the outfall detail.
- **WHEN** routing is unavailable, speculative or outside the reviewed HPP membership **THEN** the view makes that limitation clear and does not imply a confirmed connection, measured pollution plume, arrival time or safe-water conclusion.

## Non-goals
A new catchment dashboard, auto-selecting outfalls for RDP monitoring, modifying CSO incidents, new risk thresholds, flow/travel-time simulation or general-public direct RDP API access.
