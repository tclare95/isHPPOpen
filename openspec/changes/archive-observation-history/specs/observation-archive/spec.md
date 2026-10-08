# Spec Delta: Canonical observation archive

## ADDED Requirements

### Requirement: Permanent raw observation history
The system SHALL preserve canonical source observations indefinitely in private S3, partitioned by measurement and time, with schema-versioned integrity/coverage metadata and without an expiration lifecycle on raw archives.

#### Scenario: Newly ingested observations
- **WHEN** valid observations are accepted for archival
- **THEN** the stored archive identifies their measurement, observed UTC time, original value/unit/datum and provenance, and a committed manifest identifies a verifiable object version, count and checksum.

#### Scenario: Retry or corrected historic data
- **WHEN** the same batch is replayed or a source corrects a previous timestamp
- **THEN** the canonical history does not gain spurious duplicate samples, readers resolve the latest authoritative correction, and previous source versions remain traceable.

### Requirement: Archive before hot expiry
An observation SHALL NOT become eligible for DynamoDB expiry until the system has confirmed independently verifiable, permanent S3 coverage of its exact measurement and timestamp.

#### Scenario: Archive temporarily unavailable
- **WHEN** S3 upload, verification or manifest commit fails
- **THEN** unarchived observations are not marked safe for expiry, durable ingestion progress is not advanced past data not safely persisted, and the failure is visible to operators.

#### Scenario: Replay of a late observation
- **WHEN** an old or corrected observation arrives outside the 365-day hot window
- **THEN** it is archived and verified before any expiry decision, without treating an immediately expiring Dynamo record as the only copy.

### Requirement: Bounded direct historical retrieval
The system SHALL support selecting a measurement and UTC time range from committed S3 archive partitions through direct GetObject access, without depending on a second history database.

#### Scenario: User asks for older-than-one-year readings
- **WHEN** a valid range is older than 365 days
- **THEN** only the necessary committed partitions are accessed, readings are ordered and correction-aware, and response size is bounded.

#### Scenario: Archive coverage is incomplete
- **WHEN** an expected object or manifest is missing or fails integrity validation
- **THEN** the reader reports incomplete history explicitly rather than inventing observations or silently reporting a complete result.

### Requirement: Recovery from partial writes
The archive process MUST be safe to replay after interrupted S3/Dynamo operations and SHALL NOT mutate or delete current legacy Mongo/S3 historical data.

#### Scenario: S3 commit succeeded and Dynamo write failed
- **WHEN** a committed archive batch has not reached DynamoDB
- **THEN** replay can reconcile Dynamo without duplicating the archive, regressing latest pointers or falsely reporting a fully healthy ingestion run.
