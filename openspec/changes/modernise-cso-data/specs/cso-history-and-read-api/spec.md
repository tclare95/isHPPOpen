# Specification delta: CSO history and authenticated read API

## ADDED Requirements

### Requirement: Verified tiered event retention
The system SHALL keep completed CSO events queryable in hot DynamoDB for **24 UTC calendar months after their end**, with older history retrievable from committed S3 archives. Event expiry MUST be gated on separately verified S3 integrity.

#### Scenario: Completed event past retention boundary
- **WHEN** an event ended over 24 calendar months ago and its authoritative revision/evidence have verified committed S3 archive references
- **THEN** Dynamo TTL eligibility may be set and the event remains queryable through direct S3 archival reads.

#### Scenario: Event still ongoing or unresolved
- **WHEN** an event has no verified completion timestamp or still requires reconciliation
- **THEN** it is not hot-expiry eligible regardless of original start time.

#### Scenario: Archive unavailable at expiry
- **WHEN** the expected S3 archive is missing or cannot be verified
- **THEN** the event is not made hot-expiry eligible and integrity health reports the failure.

#### Scenario: Late correction after archival
- **WHEN** a completed archived event is corrected or reopened
- **THEN** its stable event ID and immutable revision chain are retained, a new committed archive generation is created, and any hot expiry or index/materialisation state is corrected before claiming success.

### Requirement: First-party IAM-authenticated CSO reads
The system SHALL extend the existing platform HTTP API with CSO domain GET routes protected by AWS_IAM and first-party workload SigV4, and SHALL keep the new CSO data inaccessible directly to browsers.

#### Scenario: Correct stage caller
- **WHEN** an authorised server-side production caller invokes a CSO GET route with a valid SigV4 signature
- **THEN** it can read the permitted CSO status/events without obtaining direct Dynamo/S3 write permissions.

#### Scenario: Preview caller hits production
- **WHEN** a Preview stage role attempts to invoke a production CSO endpoint or an unsigned caller accesses it
- **THEN** API Gateway denies the request before Lambda execution.

#### Scenario: Requested unknown asset
- **WHEN** a caller requests an asset absent from the published verified catalogue
- **THEN** the read API returns ASSET_NOT_FOUND, not a false no-spill response.

### Requirement: Honest CSO status and health
The CSO API SHALL distinguish last reported monitor state, effective state, source freshness, collection attempt and successful durable ingest.

#### Scenario: Polling success without new source update
- **WHEN** a fetch succeeds but the provider's source timestamp has not advanced
- **THEN** the response preserves last source update and marks freshness independently from fetch success.

#### Scenario: Partial batch latest
- **WHEN** a batch current-state request contains available and temporarily unavailable outfalls
- **THEN** it returns per-asset status and explicit partial metadata while preserving the good results.

### Requirement: Unified bounded current/archived event timeline
The system SHALL query CSO spill intervals overlapping a bounded requested UTC window through one endpoint, joining authoritative Dynamo and private S3 results without duplicate event IDs or lost carry-in events.

#### Scenario: Event starts before requested window and ends inside it
- **WHEN** a completed event starts before the inclusive from timestamp and ends inside the exclusive to timestamp
- **THEN** it appears exactly once in the event history with its full authoritative event start/end and provenance.

#### Scenario: Query crosses hot archive boundary
- **WHEN** the request spans the rolling two-year boundary and both stores contain an event
- **THEN** the API resolves the latest authoritative revision by stable eventId and returns one consistently ordered result.

#### Scenario: Valid next page
- **WHEN** a paginated history request continues with an unexpired authenticated-encrypted cursor
- **THEN** it keeps the same cutoff/archive generations and does not repeat or omit a boundary event.

#### Scenario: Invalid or stale cursor
- **WHEN** a cursor is tampered with, expired or references an unavailable archive generation
- **THEN** the API returns a stable invalid, expired or stale cursor error rather than silently restarting or leaking internal keys.

### Requirement: Historical gaps differ from expected archive corruption
The CSO event API SHALL return available verified history plus explicit coverage-gap metadata for genuinely uncollected or unknown periods, but SHALL fail if an expected committed archive is missing or corrupt.

#### Scenario: Historic period was never collected
- **WHEN** verified past spill events exist alongside time spans not collected by the platform or reconstructible from legacy data
- **THEN** a successful response includes verified events and explicit partial/unknown coverage intervals without claiming every spill was observed.

#### Scenario: Expected S3 archive corrupt
- **WHEN** a committed event manifest references a missing, denied or corrupt expected object
- **THEN** the API returns a storage-integrity error and no successful-looking partial event timeline.

### Requirement: Immutable event revision visibility
The system SHALL expose read-only event detail and bounded revision-summary endpoints to authorised callers, with source evidence references rather than raw internal S3 paths.

#### Scenario: Provider correction examined
- **WHEN** a consumer retrieves a corrected spill event and its revisions
- **THEN** it can identify the previous/current boundaries, source claim times, revision order and change provenance without losing the event's stable identity.
