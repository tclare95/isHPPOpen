# Specification delta: CSO collection selection

## ADDED Requirements

### Requirement: Independent complete provider asset catalogue
The system SHALL discover configured-provider CSO assets independently of Sewage Map and store a versioned last-verified catalogue, preserving stable provider asset IDs and provenance.

#### Scenario: Provider collection spans pages
- **WHEN** the provider returns multiple pages or object-ID batches
- **THEN** discovery validates completeness and commits one catalogue snapshot without truncation.

#### Scenario: Partial refresh failure
- **WHEN** discovery fails partway through a provider catalogue
- **THEN** the previously verified catalogue remains active with stale/error metadata, and partial data cannot silently replace it.

#### Scenario: Provider republished OBJECTIDs
- **WHEN** the provider republishes the ArcGIS dataset and changes OBJECTIDs while stable asset IDs remain
- **THEN** the platform retains the established canonical asset identities.

### Requirement: Explicit configured polling selection
The system SHALL poll only explicitly configured and enabled CSO asset IDs, resolving a deduplicated union of named sets from version-controlled configuration.

#### Scenario: Asset discovery does not change selection
- **WHEN** a provider discovers additional assets not included in enabled sets
- **THEN** they enter the catalogue but are not scheduled for status polling.

#### Scenario: Asset in two sets
- **WHEN** a configured asset belongs to multiple enabled sets
- **THEN** it is requested once per collection cycle and its set membership remains inspectable.

#### Scenario: Set disabled
- **WHEN** a collection set is disabled
- **THEN** its unique members cease polling while all existing source/event history remains intact.

### Requirement: Resilient unresolved asset handling
The system SHALL preserve unresolved configured IDs, expose them as unhealthy selection outcomes, and continue collecting valid peers.

#### Scenario: Configured outfall disappears
- **WHEN** an enabled configured ID is absent from the latest verified catalogue
- **THEN** it remains configured, is flagged unresolved and all other valid assets are still selected.

#### Scenario: Outfall reappears
- **WHEN** a formerly unresolved ID appears in a subsequent verified catalogue
- **THEN** it resumes selection automatically without editing the configured ID list.

### Requirement: Deterministic, auditable collection plan
The system SHALL create a bounded collection plan tied to configuration and catalogue versions and provide a safe dry-run diff.

#### Scenario: Same inputs
- **WHEN** the same source configuration and verified catalogue are resolved twice
- **THEN** the effective selected assets and plan digest are identical.

#### Scenario: Invalid configuration
- **WHEN** a provider identifier, selection set, ID syntax or polling setting is malformed
- **THEN** CI/startup rejects it instead of silently polling arbitrary assets.

### Requirement: No runtime Sewage Map dependency
The platform MUST NOT call a Sewage Map service to decide its CSO collection set.

#### Scenario: Sewage Map becomes unavailable
- **WHEN** Sewage Map's endpoint fails or disappears
- **THEN** valid configured Severn Trent assets can still be discovered and polled without it.
