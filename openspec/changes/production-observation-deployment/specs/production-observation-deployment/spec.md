# Spec Delta: Production observation deployment and readiness

## ADDED Requirements

### Requirement: Production environment isolation
The platform MUST use the explicitly approved AWS account and region while isolating Production and Staging through independent stacks, data resources, release identities, scoped execution roles, IAM boundaries, APIs, secrets, monitoring and budgets.

#### Scenario: Cross-environment access denied
- **WHEN** a staging deploy/execution/Preview identity attempts a production Dynamo/S3 read or write, Lambda invoke, API call or CloudFormation mutation (or vice versa)
- **THEN** IAM and resource policies deny the attempt without modifying either environment.

#### Scenario: Legacy infrastructure
- **WHEN** production bootstrap and resources are reviewed
- **THEN** no existing scraper, predictor, riverscraper role, Terraform state, table or bucket is adopted or modified.

### Requirement: No implicit production activation
Production deployment SHALL default to disabled runtime collection, disabled schedule, absent or inactive production read API and explicitly retained storage, with separate manual release approvals and immutable provenance.

#### Scenario: Implementation PR merges
- **WHEN** source/specifications merge or normal CI completes
- **THEN** no AWS resource, collection run, EventBridge schedule, IAM trust or read API is automatically created or enabled.

#### Scenario: Wrong target or stale approval
- **WHEN** an operator supplies wrong account/region/role/environment, previously superseded source SHA, change-set/template/hash or approval confirmation
- **THEN** prepare or apply fails before mutation.

#### Scenario: Stop production collection
- **WHEN** the approved operator disables scheduling and runtime collection
- **THEN** already committed production S3/Dynamo history, cursors, latest and health records remain retained and readable, and staging is unchanged.

### Requirement: Independent explicit measurement selection
The platform SHALL distinguish registered/published measurements from a version-controlled explicit per-environment collection selection and SHALL NOT automatically collect newly registered measurements.

#### Scenario: Initial three selected
- **WHEN** production is activated with the validated initial Colwick level and Shardlow level/flow selection
- **THEN** only these three receive scheduled provider requests and archival writes; other registered measurements remain uncollected.

#### Scenario: Six-series expansion
- **WHEN** #52 confirms all six exact EA measurement IDs and a separately approved production selection is deployed
- **THEN** the collector can ingest all six with distinct measurement identity and per-measure health, without altering the 1–3 stage allowlist.

### Requirement: Bounded archive-first continuous collection
The collector SHALL support an explicitly enabled 15-minute production schedule, with at most one concurrent Lambda invocation and bounded source concurrency; it SHALL preserve source observation times, durable archive-first ordering, idempotent replay and per-measure failure isolation.

#### Scenario: Scheduled run succeeds
- **WHEN** a selected production EA source returns observations
- **THEN** canonical S3 commit and independent verification precede accepted hot/latest/cursor state; the run records durable health per measurement.

#### Scenario: One gauge fails
- **WHEN** one selected measurement times out or is stale while peers succeed
- **THEN** it reports failure/staleness without advancing an unverified cursor and peers may complete normally.

#### Scenario: Duplicate scheduled/manual invocation
- **WHEN** a run is repeated or a scheduled/manual invocation overlaps
- **THEN** concurrency and idempotency safeguards prevent duplicate accepted canonical rows, archive corruption or cursor regression.

### Requirement: Monitored and actionable operating state
Production SHALL distinguish intentional disablement, missing scheduled invocations, stale source data, provider failures, archive/hot persistence failure and read API incidents; active alarms MUST have a tested approved notification route.

#### Scenario: Scheduler silently stops
- **WHEN** collection is declared scheduled/enabled but no completed run occurs within the configured missed-run window (initially approximately 35–45 minutes)
- **THEN** an operational alert is delivered, even if no Lambda application error occurred.

#### Scenario: Schedule intentionally disabled
- **WHEN** the production collector is deliberately switched off through the reviewed configuration
- **THEN** its missing-run monitor does not repeatedly alert, but disabled status remains visible.

#### Scenario: Successful fetch contains stale observations
- **WHEN** a source HTTP fetch succeeds but the latest source observedAt exceeds the configured freshness baseline
- **THEN** fresh collection health is NOT reported solely based on fetch time; sustained staleness is alerted separately.

#### Scenario: Archive failure
- **WHEN** a committed archive object is missing/corrupt or a write verification fails
- **THEN** the failure is visible to the operator and cannot advance the collection cursor or masquerade as a legitimate source gap.

### Requirement: Retention and controlled TTL
Production MUST retain full-resolution hot observations for 365 days and verified canonical S3 Standard history indefinitely; physical Dynamo TTL deletion MUST remain disabled until its own explicit safety review and approval.

#### Scenario: Initial collection enabled
- **WHEN** first production source collection is enabled
- **THEN** S3 permanent archive and Dynamo hot-store protections are active, but Dynamo TTL remains disabled and no S3 archive expiration is configured.

#### Scenario: TTL proposed later
- **WHEN** an operator proposes Dynamo TTL activation
- **THEN** archive-before-expiry, hot/archive overlap, read cursor continuity and preservation of latest/cursor/health have been tested and separate release approval is required.

### Requirement: Fail-closed prolonged-outage recovery
The collector SHALL recover automatically only while its durable cursor remains inside the configured normal lookback. Beyond that it MUST preserve the cursor, report `BackfillRequired` and require bounded operator-assisted repair and explicit gap approval before resumption.

#### Scenario: Short interruption
- **WHEN** a collector invocation is missed but the persisted cursor and correction overlap still fit within the configured 48-hour lookback
- **THEN** the next normal collection retries missing observations with archive-first durability and no manual cursor jump.

#### Scenario: Outage past normal lookback
- **WHEN** the cursor is too old for the configured 6-hour overlap and maximum 48-hour lookback
- **THEN** the measurement enters `BackfillRequired`, its cursor remains unchanged, and other healthy selected measurements can continue.

#### Scenario: Recoverable gap
- **WHEN** an operator approves a bounded missing interval and provider evidence is still obtainable
- **THEN** only vacant canonical measurement/timestamp identities are automatically inserted through verified archive-first repair, with auditable checkpoints and conflicting existing readings preserved.

#### Scenario: Source gap cannot be recovered
- **WHEN** a requested missing interval is demonstrably unavailable
- **THEN** its precise UTC bounds/reason/evidence are explicitly reviewed and recorded; the system does not claim continuous history or silently resume from now.

#### Scenario: Guarded cursor resumption
- **WHEN** repaired history and/or specific unrecoverable gaps have been approved for one measurement
- **THEN** an operator-authorised, conditional cursor resumption validates the original cursor and evidence before moving forward; a concurrent or stale precondition fails without mutation.

### Requirement: Authenticated production read service independently deployable
The first-party observation read API MUST be deployable in Production with its own read-only role, API, cursor secret, versioned routes and production-scoped AWS IAM caller; deployment of the API MUST NOT switch isHPPOpen's data source.

#### Scenario: Valid Production caller
- **WHEN** a permitted Vercel Production server workload signs a request with temporary Production credentials
- **THEN** it may invoke only the four approved read GET routes and receives the bounded canonical data/health contracts without direct storage access.

#### Scenario: Preview or anonymous caller
- **WHEN** a Preview workload, unsigned browser or unrelated role requests the Production API
- **THEN** AWS rejects it before handler execution without exposing credentials or internal storage.

### Requirement: Separately approved phased release and rollback
Production operational readiness SHALL be evidenced through independent inert, storage, bounded smoke, continuous collection, six-series, authenticated read API and consumer-handoff gates; each cloud mutation needs separate explicit operator authorisation.

#### Scenario: Production collector healthy, web legacy
- **WHEN** production RDP is collecting and the read API is available but #51's web cutover was not approved
- **THEN** existing isHPPOpen API responses, alerts, HPP state and forecasts continue using current sources.

#### Scenario: Collection rollback
- **WHEN** monitoring shows sustained failure after schedule activation
- **THEN** the operator can stop collection without destroying canonical data or changing staging/legacy services, and documented evidence establishes the final disabled state.
