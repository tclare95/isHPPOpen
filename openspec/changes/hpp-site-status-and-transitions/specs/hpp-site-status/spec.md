# HPP site status — product requirements

## ADDED Requirements

### Requirement: HPP evaluates an explicitly identified, equivalent level series
The service SHALL consume a verified Colwick level measurement whose station, measure, units and datum are equivalent to the legacy 2.2 m threshold input. It SHALL reject unknown or incompatible evidence rather than converting or guessing silently.

#### Scenario: Valid threshold evaluation
- **WHEN** a verified, eligible Colwick observation is strictly below 2.2 m
- **THEN** the HPP assessment is open.
- **WHEN** it is exactly 2.2 m or greater
- **THEN** the assessment is closed.

#### Scenario: Identity mismatch
- **WHEN** source identity, measure parameter, datum or units cannot be validated
- **THEN** the service SHALL not change HPP state or emit a transition; diagnostic health SHALL explain why evaluation was held.

### Requirement: Last-known state remains distinct from current evidence
The service SHALL preserve and expose the last-known status while separately identifying whether its basis is currently eligible and fresh. Initially use the existing 30-minute observation-age baseline for eligibility; confirm source publication lag and any revised threshold during later design/operational review.

#### Scenario: Missing or stale observation
- **WHEN** the latest reading is missing, older than the permitted observation-age window, unverified, or conflicted
- **THEN** the last-known open/closed state remains available, evidence is marked uncertain/stale, and no new transition is created.

#### Scenario: Recovery after a source gap
- **WHEN** verified fresh readings resume
- **THEN** a new state decision may be made from eligible evidence without fabricating historical crossings or treating old cached readings as fresh.

### Requirement: Threshold semantics are auditable
The service SHALL retain the threshold/rule identity that informed a decision; rule changes SHALL be explicit and shall not silently reinterpret already-recorded transitions.

#### Scenario: Rule change
- **WHEN** the active threshold is updated under a separately approved change
- **THEN** past event identities, status changes and timestamps remain intact, and new decisions are attributable to the new rule.

### Requirement: HPP status is independent of gauge collection and alerts
A source observation becoming available SHALL NOT itself imply that a new HPP transition or alert delivery is required.

#### Scenario: Repeated poll
- **WHEN** the status evaluated from eligible readings is unchanged
- **THEN** the last-known HPP state remains the same and no new transition or notification is caused by this service.
