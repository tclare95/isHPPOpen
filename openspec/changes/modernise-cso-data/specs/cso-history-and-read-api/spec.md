# Specification delta: CSO tiered history and authenticated reads

## ADDED Requirements

### Requirement: Event-specific, verified 24-calendar-month hot history
The system SHALL provide CSO-specific hot event queries in DynamoDB until **24 UTC calendar months after each event's verified end**, with authoritative older history directly readable from private committed S3 archives. TTL eligibility requires verified archive recoverability. Source evidence and previous revisions remain retained unless a separate approved policy changes that rule.

#### Scenario: Completed event reaches cutoff
- **WHEN** a verified completed event reaches its `endedAt + 24 UTC calendar months` boundary and its current event and required revision/evidence history are verified in S3
- **THEN** it may become hot-expiry eligible without losing queryable canonical event history.

#### Scenario: Open or unresolved event is old
- **WHEN** an event is ongoing, unresolved or lacks a verified end, even if it began more than two years ago
- **THEN** it is not TTL-eligible and remains discoverable in the hot event query path.

#### Scenario: Archived event corrected or reopened
- **WHEN** a previously completed or already archived event receives an authoritative correction or reopens
- **THEN** it retains the same event ID, the corrected authoritative generation is recoverable, and hot visibility/expiry eligibility are restored or adjusted before declaring successful reconciliation.

#### Scenario: Archive not verified
- **WHEN** the required archive or evidence cannot be read and verified
- **THEN** no new TTL eligibility is assigned and an integrity failure is surfaced rather than treating the data as absent.

#### Scenario: TTL not physically executed at the cutoff
- **WHEN** Dynamo has not yet removed an eligible hot event
- **THEN** historical reads still return that event once, not twice or not at all.

### Requirement: Private, auditable CSO event history
The system SHALL preserve canonical event versions, provider evidence linkage, archive integrity and directly readable S3 history independently of scalar gauge observations or legacy Glacier-transitioned snapshots.

#### Scenario: Previous revision requested
- **WHEN** a corrected event's audit history is requested by an authorised consumer
- **THEN** earlier material event versions and their source provenance remain available without exposing raw S3 storage paths or provider bodies.

#### Scenario: Expected committed archive is missing
- **WHEN** an archive manifest references a missing, inaccessible, corrupt or inconsistent expected event object
- **THEN** the affected read fails with an integrity error, not an apparently successful but incomplete timeline.

### Requirement: Six first-party authenticated CSO read capabilities
The platform SHALL provide bounded read-only CSO catalogue, batch current-status, per-outfall events, event detail, event revisions and per-outfall health endpoints under `/v1/cso/*`, using its existing server-to-server AWS_IAM and SigV4 contract. Browsers SHALL NOT receive direct archive/table access.

#### Scenario: Authorised first-party caller
- **WHEN** the correct stage's server-side IAM caller makes an allowed CSO GET request
- **THEN** it can read domain data without storage write permissions.

#### Scenario: Wrong-stage, unsigned or unapproved caller
- **WHEN** an unauthorised or wrong-environment caller invokes a CSO route
- **THEN** the request is denied by the API boundary before domain data is read.

#### Scenario: Unknown versus never collected
- **WHEN** an outfall is absent from the verified catalogue, versus configured but not yet collected
- **THEN** the API distinguishes not-found from known-without-observations, rather than claiming not spilling.

#### Scenario: Partial current-state batch
- **WHEN** some outfalls have verifiable current projections and others have transient storage failures
- **THEN** successful results remain available with per-asset failure details; a total dependency failure is not misreported as healthy.

### Requirement: Bounded unified event history, including carried-in events
The system SHALL provide interval-overlap history ordered consistently across live and archived tiers, with one authoritative version per stable event ID, bounded pages and opaque continuation.

#### Scenario: Event begins before query window
- **WHEN** an event starts before `from` but overlaps `[from,to)` as completed or still ongoing
- **THEN** it is returned once with the authoritative full boundary and uncertainty metadata.

#### Scenario: Event spans the 24-month tier boundary
- **WHEN** a historical window contains events in both hot and archived materialisations, including an event whose start predates the cutoff but end does not
- **THEN** each relevant event appears once, ordered consistently, regardless of its storage location.

#### Scenario: Corrected archived event
- **WHEN** an archive-backed event's authoritative start/end changes and a newer generation has been committed
- **THEN** its current identity and revised interval are discoverable without stale duplicates or missing overlap.

#### Scenario: Continuation across tier change
- **WHEN** a caller continues a bounded query through valid pages while physical TTL or concurrent ingestion changes the stores
- **THEN** the contract prevents silent omission or duplication from the tier rollover and gives an explicit stale/invalid continuation outcome when its view cannot be safely continued.

### Requirement: Coverage gaps and archive corruption are different
The API SHALL distinguish observed/verified available events from time periods not collected, not proven complete or not reconstructible; it MUST NOT imply that a polling cadence captures every discharge.

#### Scenario: Earlier history is unknown
- **WHEN** some requested time periods precede collection or have unproven reporting coverage
- **THEN** the API returns verified events alongside explicit unknown or partial coverage ranges, without inventing zero-spill intervals.

#### Scenario: Missing expected archive
- **WHEN** a manifest committed for the requested event history references an unavailable or invalid object
- **THEN** the request fails explicitly with `ARCHIVE_INTEGRITY`, not `200` plus a coverage-gap explanation.

#### Scenario: One page verified
- **WHEN** a history page has been integrity-checked but later pages have not yet been read
- **THEN** page-level integrity applies only to the records and archive objects actually verified.

### Requirement: Current status, event data and health remain honest
The read API SHALL expose provider-reported status, source age/freshness, effective state, event reconciliation/identity uncertainty, and latest attempted versus durably successful collection separately.

#### Scenario: Current state stale while event remains unresolved
- **WHEN** an asset's last report indicates active spilling, but its telemetry has become stale and an end remains unverified
- **THEN** current effective state is unknown, the original reported state/time remain visible, and no invented completed event is returned.

#### Scenario: Collection failures and catalogue staleness
- **WHEN** source polling fails, a configured outfall is unresolved, or the last verified catalogue is stale
- **THEN** the health endpoint makes these independent conditions identifiable without modifying stored event facts.
