# Spec Delta: Operational alert evaluation

## Purpose

Ensure subscribed users receive an alert reliably when a supported condition crosses its threshold, without duplicates from repeated evaluation and without decisions based on stale or missing source data.

## ADDED Requirements

### Requirement: Protected scheduled evaluation
The system SHALL require valid server-side cron authentication before running alert evaluation or exposing run details.

#### Scenario: Valid scheduled request
- **WHEN** an authorised scheduled invocation arrives
- **THEN** the evaluator runs and returns the established success envelope with a run summary.

#### Scenario: Missing or invalid cron credentials
- **WHEN** a request omits or supplies invalid cron credentials
- **THEN** the server rejects it without evaluating subscriptions or exposing subscriber information.

### Requirement: One notification per qualifying transition
The system SHALL prevent repeated evaluation, overlapping invocations or retries from producing duplicate user-visible notifications for the same confirmed alert transition.

#### Scenario: Same transition is evaluated concurrently
- **WHEN** two invocations encounter the same newly met condition for one active subscription
- **THEN** at most one delivery is accepted for that transition and both invocations preserve a consistent alert state.

#### Scenario: Qualifying condition clears and subsequently recurs
- **WHEN** the condition is observed to clear and later crosses the subscription threshold again
- **THEN** the subscription may re-arm and a new transition can generate a new notification.

#### Scenario: Provider outcome is uncertain
- **WHEN** a delivery is claimed but sending fails or the provider result is unknown
- **THEN** the system records a recoverable or reviewable delivery state and does not blindly send a second uncorrelated email.

### Requirement: Source-health-aware evaluation
The system SHALL refrain from triggering or re-arming an alert whose required source data is unavailable or stale, and SHALL allow unrelated healthy-source alert types to continue.

#### Scenario: Stale source
- **WHEN** the input required to determine an alert's condition is stale
- **THEN** that alert remains unchanged and does not send or re-arm.

#### Scenario: Independent source failure
- **WHEN** forecast data is unavailable while healthy live gauge readings are present
- **THEN** forecast-based alerts are skipped and eligible live-gauge alerts may still be evaluated.

### Requirement: Observable scheduled runs
The system SHALL record enough non-sensitive run health to distinguish successful, degraded, failed and missing scheduled evaluation without requiring subscriber records to be inspected.

#### Scenario: A run completes with partial upstream failure
- **WHEN** a scheduled evaluation finishes with one or more failed input sources
- **THEN** its recorded result identifies degraded source health, timing and bounded counters.

#### Scenario: Expected scheduled evaluation does not occur
- **WHEN** a scheduled run is absent beyond the agreed observation window
- **THEN** an operator can identify that scheduled evaluation is unhealthy.

### Requirement: Reversible evaluation cadence
The system SHALL support an approved schedule change and a documented return to the previous 15-minute cadence without losing subscriptions, delivery history or threshold settings.

#### Scenario: Trial five-minute cadence
- **WHEN** the approved five-minute cadence is enabled
- **THEN** alerts can be evaluated at that cadence without assuming their input sources refresh equally often.

#### Scenario: Cadence rollback
- **WHEN** the trial is rolled back
- **THEN** the evaluator returns to the 15-minute schedule while preserving existing subscription and notification state.
