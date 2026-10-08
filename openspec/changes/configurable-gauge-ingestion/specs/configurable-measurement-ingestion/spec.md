# Spec Delta: Configurable measurement ingestion

## Purpose

Allow operators to collect additional supported EA station measurements by reviewing a version-controlled configuration change, while preserving stable measurement identity, recorded data accuracy and compatibility with current site consumers.

## ADDED Requirements

### Requirement: Version-controlled measurement configuration
The new .NET collector SHALL load and validate a version-controlled definition of active sources, stations and measurements before scheduled collection, without requiring an administration interface or modifying legacy Lambdas.

#### Scenario: New supported EA level measurement is configured
- **WHEN** a valid measurement definition is added and deployed
- **THEN** the collector includes that measurement in subsequent eligible collection runs without a bespoke handler for that station.

#### Scenario: Misconfigured measurement
- **WHEN** configuration contains duplicate identities, missing external identifiers, unsupported units or inconsistent provider/measurement fields
- **THEN** validation reports the problem and prevents unsafe collection for that invalid configuration.

### Requirement: Stable measurement and observation identity
The system SHALL identify each observation using a measurement-specific identity and its observed UTC timestamp, not a station identifier alone.

#### Scenario: Level and flow share a station and timestamp
- **WHEN** the same station reports a level and a flow value at the same observed time
- **THEN** the observations remain distinct and cannot overwrite one another.

#### Scenario: Already collected observation is received again
- **WHEN** an overlapping scheduled fetch or backfill returns an identical observation
- **THEN** the ingestion result is idempotent and no duplicate observation is created.

#### Scenario: Published source corrects an old reading
- **WHEN** a provider changes a previously observed value
- **THEN** the normalised record retains enough provenance to apply the documented deterministic correction policy.

### Requirement: Normalised observations preserve meaning
The ingestion system SHALL retain the original source/measurement reference, observed UTC timestamp, value, parameter, unit and supported quality/provenance metadata rather than conflating observations with forecasts or state transitions.

#### Scenario: EA level reading is received
- **WHEN** a supported EA level measurement is collected
- **THEN** its normalised observation retains the level unit and source measure identity and distinguishes `observedAt` from `ingestedAt`.

#### Scenario: Other domain data is encountered
- **WHEN** a forecast, HPP open/closed event or CSO spill interval is processed elsewhere in the suite
- **THEN** it is not silently forced into a scalar gauge-observation record.

### Requirement: Fault-isolated incremental collection
The ingestion system SHALL collect measurements incrementally with a bounded re-fetch window, safe retry/backfill semantics and independent handling of failures per configured measurement.

#### Scenario: One EA measure endpoint fails
- **WHEN** collection of one configured measurement fails
- **THEN** other eligible measurements can complete and the failed measurement is marked unhealthy without losing its prior valid data.

#### Scenario: Scheduled fetch is repeated
- **WHEN** a scheduled run is retried or overlaps another run
- **THEN** ingestion remains idempotent, watermarks do not move past unpersisted observations, and repeat execution cannot corrupt the measurement history.

### Requirement: Durable DynamoDB hot observations
The collector SHALL persist uniquely keyed full-resolution observations for a rolling 365-day window in DynamoDB, using measurement-specific monthly partitions, and SHALL conditionally maintain the latest per-measurement value.

#### Scenario: Corrected and stale duplicate observations
- **WHEN** a provider corrects an already stored timestamp while an older fetch is retried
- **THEN** the authorised correction wins deterministically, the older retry cannot overwrite it, and the latest pointer does not regress.

#### Scenario: Historical query spans month boundaries
- **WHEN** an authorised consumer requests a bounded 365-day measurement range across months
- **THEN** only relevant measurement/month partitions are queried, raw samples are returned chronologically and all continuation pages are accounted for.

#### Scenario: Archive not implemented yet
- **WHEN** stage-2 Dynamo persistence is available without the permanent S3 archive
- **THEN** no production scheduled ingestion or automatic observation TTL is enabled.

### Requirement: Safe compatibility boundary
The new .NET collector SHALL support shadow or parallel collection without changing current production S3/Mongo payloads or consumer responses before an explicitly approved cutover.

#### Scenario: New collector is enabled for verification
- **WHEN** a configured measurement is collected in shadow mode
- **THEN** its data can be compared against source observations without changing the existing `levels/latest.json` contract or HPP/Trent dashboard responses.

#### Scenario: Migration is not yet approved
- **WHEN** a new collector build is ready but the existing consumer cutover has not been approved
- **THEN** the established scraper/web contracts continue to be served by the existing production path.
