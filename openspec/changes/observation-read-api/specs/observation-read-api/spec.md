# Spec Delta: Authenticated observation read API

## ADDED Requirements

### Requirement: Independent authenticated read service
The system SHALL provide a separate .NET read Lambda for first-party server-to-server retrieval through explicitly routed API Gateway HTTP API GET endpoints using AWS_IAM and SigV4, with its own read-only execution identity.

#### Scenario: Correct production caller
- **WHEN** a valid production Vercel workload role signs a request to a production observation GET route
- **THEN** API Gateway authorises that exact invoke action and the Lambda returns the requested permitted data without granting the caller direct DynamoDB/S3 access.

#### Scenario: Unsigned or wrong-stage caller
- **WHEN** a request is unsigned, signed by an unauthorised principal, or a Preview role invokes Production
- **THEN** API Gateway rejects it before the Lambda runs.

#### Scenario: Attempted mutation
- **WHEN** a caller requests a write method or tries to access unregistered S3 keys/Dynamo tables through the read service
- **THEN** no mutation or arbitrary storage access is possible and IAM/route validation rejects the attempt.

### Requirement: Discoverable canonical measurements
The API SHALL expose published measurement metadata with stable source-specific IDs, and SHALL reject arbitrary unknown/disabled measurement identifiers rather than querying caller-supplied storage partitions.

#### Scenario: Level and flow from the same station
- **WHEN** a station exposes level and flow observations for the same UTC timestamp
- **THEN** both have independently addressable measurement IDs, original units/parameter and neither overwrites the other.

#### Scenario: Unknown measurement
- **WHEN** a caller requests an ID that is not in the authorised published registry
- **THEN** the API responds with `404 MEASUREMENT_NOT_FOUND`.

### Requirement: Batched latest values and honest freshness
The API SHALL return up to 20 uniquely requested latest measurements in deterministic order and distinguish data availability, age/freshness and individual dependency failure.

#### Scenario: Some measurements unavailable
- **WHEN** one measurement latest read fails and other measurements succeed
- **THEN** the response contains successful values, a per-measure unavailable state for the failure and `meta.partial=true`, without replacing failed readings with numeric zero.

#### Scenario: Collected but stale
- **WHEN** the last source observation timestamp is older than the configured freshness policy despite a successful request
- **THEN** the API preserves the actual value/observed timestamp and marks it stale, rather than claiming freshness from the request time.

#### Scenario: Known measurement has never reported
- **WHEN** a configured measurement has no stored observation
- **THEN** latest returns `no_observations`, not an unknown measurement error.

### Requirement: Unified bounded full-resolution history
The API SHALL expose one history endpoint for source observations regardless of whether rows are in DynamoDB's 365-day hot window or S3's permanent archive, using UTC, chronological pagination and no artificial readings.

#### Scenario: Query crosses storage cutoff
- **WHEN** a request spans the 365-day boundary
- **THEN** the API selects DynamoDB and committed S3 archive partitions using a single pinned request cutoff, resolves authoritative corrections and returns one chronological series with no duplicate measurement/timestamp pairs.

#### Scenario: Month and leap-year boundaries
- **WHEN** a valid inclusive-from/exclusive-to window crosses month, year or leap-day boundaries
- **THEN** all actual source readings within the requested window are eligible to appear once and none outside it appear.

#### Scenario: Dynamo response exceeds internal page
- **WHEN** DynamoDB Query responds with a LastEvaluatedKey before the API page is filled
- **THEN** the API continues bounded monthly queries until its own page limit/byte budget or the requested window ends, rather than truncating the returned history.

#### Scenario: Caller requests excessive data
- **WHEN** a requested window exceeds 366 days, page limit exceeds 5000, serialised output exceeds safe bounds or parameters are invalid
- **THEN** the API rejects invalid inputs or ends a valid page early with a continuation cursor, without unbounded scanning or downloading every S3 archive.

### Requirement: Secure and deterministic continuation
The API SHALL issue an opaque authenticated cursor bound to the original query, environment, fixed hot/archive cutoff and required archive generation references, expiring after 30 minutes.

#### Scenario: Valid continuation
- **WHEN** the client requests the next page with an unexpired unchanged query and existing archive revisions
- **THEN** chronological pagination resumes after the last emitted observation without duplicate boundary rows.

#### Scenario: Invalid or expired continuation
- **WHEN** the cursor is forged, used for a different query, expired or refers to an unavailable archive revision
- **THEN** the API returns a stable invalid, expired or stale cursor error; it does not silently restart at the beginning.

### Requirement: Honest incomplete historical source coverage
The API SHALL return available verified observations with explicit `complete`, `partial` or `unknown` coverage and gap ranges grounded in ingest/archive/migration evidence, without assuming continuous reporting at the configured sample interval.

#### Scenario: Historical readings cannot all be reconstructed
- **WHEN** a requested older interval is known to be missing because data was never collected or is irrecoverable from legacy archives
- **THEN** the API returns `200` with available verified observations, `coverage.status=partial` and the known reason/range of each historical gap.

#### Scenario: Coverage is not known
- **WHEN** neither committed archives nor source/migration records establish coverage for an interval
- **THEN** the API reports `coverage.status=unknown` with explicit unknown ranges rather than claiming complete data or zero observations.

#### Scenario: Legitimately absent source reading
- **WHEN** the source omitted an expected 15-minute interval but source/collection metadata indicates no archive loss
- **THEN** the API does not synthesise a reading or flag archive corruption solely because the timestamp is absent.

### Requirement: Missing expected archive is a storage error
The API MUST refuse to represent a missing, inaccessible or corrupt *expected* archived object or manifest as a successful partial historical result.

#### Scenario: Manifest points to missing object
- **WHEN** a committed manifest references an archive object that returns not found, access denied, checksum failure or unreadable data
- **THEN** the history request fails with `503 ARCHIVE_INTEGRITY` and a safe diagnostic correlation ID.

#### Scenario: Archive recovery becomes possible
- **WHEN** an expected archive object is restored and validated
- **THEN** a retried request can return verified history without fabricating records or changing archival retention.

### Requirement: Read-only source health
The API SHALL expose collection/persistence health derived from ingestion outcomes and observation timestamps, with stale/failure distinct from merely successful HTTP polling.

#### Scenario: Poll succeeded but persistence failed
- **WHEN** an upstream fetch succeeds but the canonical write or archive commit fails
- **THEN** the health response reports unsuccessful durable ingest and does not advance the successful persisted timestamp.

### Requirement: Compatibility and separately approved cutover
The backend SHALL NOT change the currently published Next.js routes, Mongo HPP status, predictor, CSO, archive retention, old scraper Lambda or alert-delivery behaviour.

#### Scenario: Read backend deployed before consumer switch
- **WHEN** the new API is ready in an isolated environment but the web read preference has not been switched
- **THEN** existing dashboards, public API responses and alerts continue using established sources.

#### Scenario: Web consumer migration begins separately
- **WHEN** the follow-on web change migrates a consumer
- **THEN** the intended order is Trent dashboard, observed levels, then gauge alert reads, with reversible per-consumer fallback and existing alerts not double-sent.
