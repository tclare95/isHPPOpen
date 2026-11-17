# Capability: Clear current river conditions for HPP visitors

## ADDED Requirements

### Requirement: A useful current-conditions summary
The existing site SHALL offer a prominent, concise summary of current conditions relevant to HPP/Trent visitors, drawing from authoritative HPP status, observed river level/trend, available model forecast and useful supported nearby gauges.

#### Scenario: All evidence available
- **WHEN** fresh HPP, level and forecast information are available **THEN** the summary clearly distinguishes current HPP operational status, current Colwick observed level and recent movement, predicted movement and relevant nearby-gauge context, with useful links to detail.
- **WHEN** HPP is closed for a reason independent of the latest level **THEN** the summary preserves that authoritative status and reason rather than guessing access from a numeric threshold.
- **WHEN** a forecast crosses a threshold **THEN** it is identified as predicted conditions, not a confirmed future HPP operational decision.

### Requirement: Honest degradation
- **WHEN** one source is delayed, missing or disagrees with another **THEN** each source's evidence and age remains distinguishable; the whole summary does not become a fabricated all-clear or a meaningless single error.
- **WHEN** a requested nearby gauge is not verified or uses a different measure/unit/datum **THEN** its information is absent or independently labelled, never silently substituted or treated as the same height reference.
- **WHEN** data are still loading **THEN** no fabricated zero reading, level change or HPP opening is displayed.

### Requirement: Existing pages stay primary
- **WHEN** a visitor needs detail **THEN** the summary links to the existing historical, Trent, forecast and relevant water-quality experiences rather than duplicating their full charts.
- **WHEN** used on a mobile screen **THEN** the primary condition, evidence freshness and navigation remain readable and accessible.

## Non-goals
A new separate dashboard, changes to the HPP authority/writer, new forecast generation, real-time flood warnings, boating-safety guarantees or arbitrary composite safety scores.
