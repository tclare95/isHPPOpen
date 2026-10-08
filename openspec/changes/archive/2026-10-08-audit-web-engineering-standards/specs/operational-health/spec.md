# Spec Delta: Operational health

## Purpose

Provides authorised operators with a consistent overview of upstream source health and the actual time taken to check each source, without exposing protected diagnostics publicly or allowing one failed source to conceal others.

## ADDED Requirements

### Requirement: Authorized access to operational diagnostics
The system SHALL expose operational-health diagnostics only to an authenticated admin-route session and SHALL preserve the existing API success and error envelope.

#### Scenario: Authenticated operator requests diagnostics
- **GIVEN** an authenticated session
- **WHEN** the operator requests the operational-health endpoint
- **THEN** the response is successful and contains a `checkedAt` timestamp and a `sources` array in the response data.

#### Scenario: Unauthenticated request
- **GIVEN** there is no authenticated session
- **WHEN** the endpoint is requested
- **THEN** the response has HTTP status 401 and the standard error envelope, without exposing source diagnostics.

### Requirement: Accurate source-check durations
The system SHALL report a finite, non-negative `latencyMs` for each source check, covering the full execution time of that check, including awaited asynchronous work.

#### Scenario: Successful slow source check
- **WHEN** a source check completes successfully after a measurable delay
- **THEN** that source's `latencyMs` reflects the elapsed duration rather than the time taken merely to start the check.

#### Scenario: Failed source check
- **WHEN** a source check fails after a measurable delay
- **THEN** its `latencyMs` reflects the elapsed duration through failure.

### Requirement: Independent source-health results
The system SHALL return a result for each configured operational source even when another source check fails, and SHALL preserve the established per-source health shape.

#### Scenario: One source fails while others succeed
- **WHEN** one check throws while another check succeeds
- **THEN** the endpoint returns all configured source entries, with a health state of `unavailable` for the failed source and the successful source's own health result.

#### Scenario: Check result shape remains compatible
- **WHEN** an authenticated operator requests diagnostics
- **THEN** every source entry has a `name`, `latencyMs`, and `health` object, and the endpoint preserves its existing top-level response envelope and `checkedAt` value.
