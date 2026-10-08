# Spec Delta: Ingestion health

## Purpose

Provide operators with an accurate indication of whether configured measurements are being collected successfully and whether stored observations are sufficiently recent.

## ADDED Requirements

### Requirement: Per-measurement collection health
The ingestion system SHALL record the most recent collection attempt, outcome, usable observation time and relevant lag per configured measurement without conflating successful polling with fresh source data.

#### Scenario: Successful HTTP response without new source observation
- **WHEN** an EA endpoint responds successfully but its latest observation has not advanced
- **THEN** collection can be recorded as technically successful while observation freshness remains based on the older observed timestamp.

#### Scenario: Failed measurement with healthy neighbours
- **WHEN** one measurement fetch fails while others complete
- **THEN** the result identifies the failed measurement, preserves previous observations and reports successful outcomes for unaffected measurements.

### Requirement: Bounded operator diagnostics
The ingestion system SHALL make source, measurement, run timestamp, result and freshness information available to authorised operational inspection without disclosing credentials or unbounded upstream error content.

#### Scenario: Operator inspects a failed run
- **WHEN** an operator views diagnostics for a failed collection
- **THEN** they can identify the affected measurement and last healthy observation time without needing to inspect raw secrets or personal data.
