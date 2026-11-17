# Capability: Compare observed high-water events

## ADDED Requirements

### Requirement: Visitors can compare selected events
isHPPOpen SHALL allow visitors to compare at least two existing Colwick high-water events using the same qualified historical evidence and rules as the current event explorer.

#### Scenario: Two events selected
- **WHEN** a visitor selects two available Colwick events **THEN** a coherent comparison shows their observed peaks, relevant durations, rise/recovery context and level curves, identified by date and source measurement.
- **WHEN** curves are overlaid or aligned relative to their event peaks/starts **THEN** the alignment is explained and actual dates remain accessible. An observed relationship is not presented as predictive travel time.
- **WHEN** a visitor returns to the event detail **THEN** the original event pages and deep links remain available.

### Requirement: Comparing evidence does not erase uncertainty
- **WHEN** an event includes missing readings, unobserved start/end, provisional values or a partially charted window **THEN** the comparison retains the applicable limitations and avoids unsupported exact rankings or complete duration claims.
- **WHEN** historical observations have been corrected and an event identifier moves or no longer resolves **THEN** the comparison uses the existing resolution semantics or clearly requests a replacement selection, rather than silently comparing another event.

### Requirement: Later cross-gauge comparisons are conditional
- **WHEN** a related gauge lacks verified historical coverage or compatible measurement interpretation **THEN** it is unavailable as a comparator; a fabricated or substituted series is not shown.
- **WHEN** more than one station is compared **THEN** stations, units and datum/reference differences remain explicit; equal numeric heights at different gauges are not treated as equal water depths or conditions.

## Non-goals
A new historical event catalogue, reclassification of HPP closures, flood warnings, return periods, a travel-time model or mandatory multi-gauge backfill.
