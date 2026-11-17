# Capability: Observed rainfall context for river conditions

## ADDED Requirements

### Requirement: Explain recent rainfall with existing level observations
Visitors SHALL be able to inspect relevant selected RDP observed rainfall near the existing river-level context without confusing it with forecasts or creating a general rainfall platform UI.

#### Scenario: Recent available rainfall
- **WHEN** a supported RDP rainfall measure returns verified interval totals **THEN** the page can show them alongside time-aligned river levels, with the station/measurement, period, amount in mm, and clear observed-vs-forecast distinction.
- **WHEN** the visitor selects another supported period or measurement **THEN** the display remains bounded and uses the source's available evidence rather than filling omitted periods with zero.

### Requirement: Interval and quality meanings are preserved
- **WHEN** a rainfall row represents a 15-minute period total **THEN** its value is not presented as an instantaneous rain rate or arbitrary point measurement.
- **WHEN** RDP has not verified whether a source label denotes the start or end of its 15-minute interval **THEN** no physical start/end time or precise alignment is asserted for that row.
- **WHEN** a displayed accumulation window has missing, ineligible, uncertain or unreadable constituent intervals **THEN** a complete total is not claimed, and the missing/unsupported part is distinguished from observed zero.
- **WHEN** a source reading is delayed, revised or unavailable **THEN** the display preserves source age and provenance or shows a clear limitation instead of inventing current rainfall.

### Requirement: Correlation is not causation
- **WHEN** a visitor sees rain and river levels together **THEN** the product does not claim a proven causal contribution, river transit time, forecast improvement or water safety outcome merely from visual proximity.
- **WHEN** the existing forecast page also shows predicted precipitation **THEN** it is separately labelled as a forecast, not merged into measured rainfall totals.

## Non-goals
Hydrological modelling, predictor feature changes, new RDP registrations/collections, rainfall alert rules, unapproved historical backfill or generic rainfall analytics.
