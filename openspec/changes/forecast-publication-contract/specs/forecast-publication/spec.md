# Forecast publications — product requirements

## ADDED Requirements

### Requirement: Distinguish independently produced forecast kinds
A forecast publication SHALL identify its forecast source/kind so that a government forecast is never presented as an ML prediction or vice versa. Source identity and available model/version attribution SHALL be preserved without mandating one common storage shape.

#### Scenario: Two forecasts for the same gauge
- **WHEN** government-page and model-predicted values exist for the same forecast target
- **THEN** they remain separately attributable, with their respective quality/health and issued times.

### Requirement: Preserve time, units and provenance semantics
Publications SHALL distinguish when a forecast was issued/generated, what future time each value targets, and when supporting observations were measured (where applicable). Units and gauge identity must remain explicit or verifiably equivalent at compatibility boundaries.

#### Scenario: Future targets, old issue
- **WHEN** target dates are in the future but the most recent successful source publication was issued outside the permitted freshness window
- **THEN** the forecast is stale, not fresh merely because target timestamps are future.

#### Scenario: Source absence
- **WHEN** a source returns no usable forecast, an unverified identity/datum, or malformed values
- **THEN** the publication reports unavailability/incompleteness as appropriate; it SHALL NOT manufacture readings or silently substitute another forecast kind.

### Requirement: Preserve existing predictor outputs
The current predictor's published forecast and diagnostic series SHALL remain available to their existing web and alert consumers until any separately approved compatible migration.

#### Scenario: Existing prediction consumers
- **WHEN** a consumer loads the existing `forecasts/colwick_forecast.csv` or the accuracy, history, summary, stability and model-health objects
- **THEN** its documented fields, time ordering, units, optional fields and missing-data semantics remain compatible.

### Requirement: Publication ownership is independent from prediction execution
A shared publication contract SHALL NOT require moving the Python predictor's training, inference, deployment or hourly execution into RDP or the successor to the Node scraper.

#### Scenario: Government feed outage
- **WHEN** the government forecast source fails
- **THEN** the independent ML forecast and its existing outputs continue according to their own availability/health, without using their values as an undeclared replacement for the government forecast.
