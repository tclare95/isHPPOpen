# Capability: Actionable administration overview

## ADDED Requirements

### Requirement: One useful operational starting point
Authorized administrators SHALL be able to understand the last known health of major isHPPOpen functions from the admin overview, building on existing source-health diagnostics.

#### Scenario: Current system evidence
- **WHEN** an admin opens the overview **THEN** it shows available source/status evidence for relevant HPP status evaluation, river levels/forecast, CSO/water-quality and alert evaluation/delivery, with meaningful timestamps and outcome or diagnostic links where supported by existing records.
- **WHEN** a system has never run, a check is unavailable or evidence is too old **THEN** the view says unknown/not checked or degraded as appropriate, rather than healthy.

#### Scenario: Actionable failure
- **WHEN** a component has a recorded failure or held/failed operation **THEN** the admin can see a concise reason/category and an appropriate route to existing diagnostics or operational instructions, without needing to infer it from a generic colored badge.
- **WHEN** unrelated sources disagree or fail independently **THEN** the view preserves their separate states rather than presenting a single misleading all-clear.

### Requirement: Secure, bounded and read-only
- **WHEN** an anonymous or non-admin caller requests protected diagnostics **THEN** access is refused according to the site's administrator authorization policy.
- **WHEN** diagnostics contain tokens, addresses or provider/internal details **THEN** the public or admin UI shall not inadvertently disclose secrets or unnecessary subscriber information.
- **WHEN** evidence cannot be retrieved **THEN** the overview renders a useful partial result; it SHALL NOT trigger production jobs, replay alerts, mutate source state or perform unbounded history scans simply to display status.

### Requirement: Compatibility
The existing operational-health API response SHALL retain its documented fields and meanings. Additional diagnostics may use another protected read-only route if appropriate.

## Non-goals
A generic monitoring suite, admin controls to force alert delivery or HPP transitions, automatic rollback, editing production infrastructure, or replacing external observability.
