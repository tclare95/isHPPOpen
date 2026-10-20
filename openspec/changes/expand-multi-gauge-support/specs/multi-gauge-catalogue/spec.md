# Spec Delta: Multi-gauge measurement catalogue

## ADDED Requirements

### Requirement: Existing isHPPOpen six-series identity parity
RDP SHALL register and expose exact canonical measurement identities for all six existing isHPPOpen dashboard series, after validating source measurement IDs, parameters, units/datums and expected sampling period.

#### Scenario: Five stations, six measurements
- **WHEN** a first-party caller requests the catalogue for Colwick, Clifton Bridge, Shardlow, Church Wilne and Kegworth
- **THEN** it can address six distinct configured measurements, including independent level and flow at Shardlow, without station-key collision.

#### Scenario: Ambiguous upstream station measurements
- **WHEN** a station offers more than one level measure or reporting period
- **THEN** configuration must bind to an explicitly validated external measure ID rather than picking a station/parameter match arbitrarily.

### Requirement: Versioned, verified, stable measurement registration
RDP MUST validate reviewed version-controlled source/station/measurement configuration, reject duplicate identities and unsupported unit/datum/interval combinations, and never recycle a canonical ID for a different measurement.

#### Scenario: Unsupported datum or parameter
- **WHEN** a proposed gauge cannot be safely represented by the supported first-stage level/flow model
- **THEN** registration fails with actionable validation evidence, rather than silently changing values or reinterpretating their datum.

### Requirement: Registration does not enable collection or publication
RDP SHALL distinguish registered measurements, explicitly approved environment collection selections and intentional internal read-catalogue publication. An addition SHALL NOT automatically start polling or expose an unpublished measurement.

#### Scenario: Add a registered gauge
- **WHEN** a supported measurement is added to the registry but is not included in the explicit environment collection selection
- **THEN** its ingestion remains disabled and no schedule or production resource is activated.

#### Scenario: Unpublished measurement lookup
- **WHEN** a first-party client guesses an ID that is not published for internal reads
- **THEN** the API rejects the query without accessing arbitrary Dynamo partitions or S3 objects.

### Requirement: Configurable supported EA gauge onboarding
RDP SHALL support adding another valid EA 15-minute level/flow measurement through reviewed configuration and generic existing adapters without station-specific code changes.

#### Scenario: Seventh valid fixture
- **WHEN** a seventh supported EA measurement is introduced into configuration with a validated external ID
- **THEN** catalogue/read adapters accept it after intentional publication without application-specific code changes, while no live collection occurs unless separately selected.

### Requirement: Health and history are measurement-specific
RDP SHALL preserve independent level/flow observations, provenance, history and freshness/health for each canonical measurement.

#### Scenario: One source fails
- **WHEN** one EA station or measurement has no fresh observations while its neighbour succeeds
- **THEN** the failed measurement has its own stale/unavailable status and the healthy measurement remains retrievable.

### Requirement: Platform/consumer presentation separation
RDP SHALL expose reusable source/measurement metadata independent of isHPPOpen's curated display grouping, ordering and alert eligibility.

#### Scenario: RDP-only measurement
- **WHEN** RDP registers and intentionally publishes a measurement that is not selected in isHPPOpen
- **THEN** first-party RDP API clients may query it (subject to authorisation and data availability) without an isHPPOpen deployment, and the website does not automatically show or alert on it.

### Requirement: Small-stage and private-API boundaries
The gauge expansion MUST preserve stage 1–3 explicit selection, disabled default scheduling, manual deployment/production approvals and first-party AWS_IAM read access without enabling an external/public API.

#### Scenario: Configuration-only PR merged
- **WHEN** the new registry configuration merges without a separately authorised production collection or public-access change
- **THEN** collection schedules remain unchanged, stage does not poll six gauges automatically, no new web visibility is implied and the current API remains private.
