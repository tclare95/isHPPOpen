# Specification delta: CSO state, spill events and revisions

## ADDED Requirements

### Requirement: Separate source claims, current status and spill events
The system SHALL persist CSO provider evidence, the current reporting/freshness projection and identifiable spill events as separate domain records, with versioned provenance.

#### Scenario: Repeated unchanged polling
- **WHEN** an asset returns the same provider event/status information on consecutive collection runs
- **THEN** the platform records collection success and freshness without creating duplicate events or unnecessary duplicate event revisions.

#### Scenario: Source reports currently spilling but is stale
- **WHEN** the last provider-reported state is spilling and no fresh confirmed status exists
- **THEN** the API preserves last reported spilling and observed timestamps but sets effective current status to unknown, not to confirmed spilling or stopped.

#### Scenario: Provider reports monitor offline
- **WHEN** the provider marks a monitor offline
- **THEN** its effective current status is unknown and no spill event is closed solely because the monitor went offline.

### Requirement: Provider-reported event boundaries take priority
The system SHALL prefer valid source-reported event start/end timestamps to inferred polling times and SHALL preserve any uncertainty about unavailable boundaries.

#### Scenario: Event occurs between polls
- **WHEN** one source record reports both a valid event start and end occurring between collection runs
- **THEN** the platform records one completed event using the provider timestamps even though active spilling was never directly polled.

#### Scenario: No exact start supplied
- **WHEN** status changes suggest an event but the source provides no valid exact start time
- **THEN** the platform may preserve bounded inferred evidence but cannot claim a precise event start or duration.

#### Scenario: Invalid event end
- **WHEN** the provider claims an end before the event start or timestamps cannot be parsed consistently
- **THEN** the claim is retained/quarantined for investigation and must not overwrite a valid event with an impossible interval.

### Requirement: Stable event identity and replay-safe revisions
The system SHALL assign stable internal event identities, preserve material changes as immutable revisions, and prevent older/repeated source claims from overwriting a newer authoritative revision.

#### Scenario: Provider corrects event start
- **WHEN** an unambiguous event's source-reported start time is corrected
- **THEN** the canonical eventId remains unchanged, query indexes reflect the revised time, and the previous claim and event revision remain auditable.

#### Scenario: Provider corrects event end
- **WHEN** an event's completed end time changes in a later authoritative provider claim
- **THEN** the same eventId advances a revision and the new authoritative duration is returned without hiding prior revisions.

#### Scenario: Late retry arrives
- **WHEN** a previously processed older claim is replayed after a more recent authoritative correction
- **THEN** it does not replace the latest event revision or create a duplicate event.

#### Scenario: Two nearby spills ambiguous
- **WHEN** an incoming source claim could refer to either of two adjacent spills
- **THEN** both existing events remain distinct, the claim is marked needs_reconciliation and no silent merge or invented timestamps occur.

### Requirement: Durable, isolated collection
The system SHALL use versioned collection plans, bound source concurrency/retries, and persist source evidence before acknowledging derived event/status writes.

#### Scenario: Some selected assets fail
- **WHEN** polling some outfalls returns provider errors, malformed ArcGIS success bodies or timeouts
- **THEN** other selected outfalls can complete and each failed ID has an explicit collection/health outcome without overwriting valid prior events.

#### Scenario: S3 evidence commit fails
- **WHEN** an immutable source claim cannot be verified/committed in S3
- **THEN** its event/current-state durable checkpoint does not advance and safe replay is possible.

#### Scenario: Dynamo event projection fails after S3 commit
- **WHEN** S3 evidence is durably committed but Dynamo updates fail
- **THEN** replay produces one authoritative event/current projection without duplicating events or losing evidence.

### Requirement: Platform module without consumer cutover
The CSO capability SHALL be independently deployable inside the unified .NET data backend without modifying the current Node scraper, Mongo CSO history, web water-quality risk calculations or alerts.

#### Scenario: New collector available in staging
- **WHEN** the CSO domain is provisioned in approved staging
- **THEN** legacy CSO status and alert consumers continue to operate unchanged until a separately authorised shadow comparison and cutover.
