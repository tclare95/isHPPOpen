# Spec Delta: Historical gauge observation backfill

## ADDED Requirements

### Requirement: Inventory reasonably recoverable historical evidence
The system SHALL provide a bounded, read-only inventory of accessible legacy river observation snapshots and supported upstream history, retaining evidence of coverage and recovery limits.

#### Scenario: Repeated cached history
- **WHEN** many Mongo/S3 snapshot documents repeat readings from the same gauge and observed UTC timestamps
- **THEN** the inventory records their source evidence without treating each snapshot as a separate canonical reading.

#### Scenario: Unavailable historical period
- **WHEN** no reasonably accessible source can establish an older interval
- **THEN** the importer reports a reasoned gap or `unknown` rather than inventing samples or blocking all other imports.

### Requirement: Verified identity and individual provenance
The importer MUST normalise source observations using a verified canonical measurement ID, original observed UTC timestamp, numeric value, unit/datum and source evidence; a snapshot timestamp is not a measurement revision.

#### Scenario: Cached reading in a direct-source-labelled snapshot
- **WHEN** `level_source=flood-api` contains a reading merged from earlier cached S3 history
- **THEN** the importer does not treat the snapshot label/time as proof that the individual reading was refetched directly.

#### Scenario: Ambiguous government-page identity
- **WHEN** legacy fallback uses a government-page station reference not yet demonstrated equivalent to the registered EA measurement
- **THEN** its observations remain quarantined, with the conflicting station/datum evidence recorded.

### Requirement: Deterministic deduplication and candidate conflict handling
The importer SHALL deduplicate by canonical measurement ID and exact UTC observed time, preserve source evidence, choose the strongest verified candidate for an **unoccupied** canonical identity and quarantine equally credible conflicting values.

#### Scenario: Duplicate same reading
- **WHEN** the same source reading is repeated in 100 snapshots
- **THEN** it creates at most one canonical observation and preserves a compact evidence count/reference set.

#### Scenario: Two credible different values
- **WHEN** two credible legacy candidates disagree on one measurement and observed timestamp without decisive source evidence
- **THEN** neither is automatically installed; the conflict report lists candidate values and evidence.

### Requirement: Existing canonical observations are protected
Automatic historical backfill MUST NOT overwrite, revise or replace an existing committed RDP canonical observation, including during concurrent live collection. Such changes require an independently authorised correction path.

#### Scenario: Stronger imported value conflicts with RDP
- **WHEN** a verified historic EA value differs from an already committed RDP value at the same measurement/timestamp
- **THEN** the importer retains the existing value and records the conflict without changing archive, hot store or latest.

#### Scenario: Concurrent live write wins
- **WHEN** a live collector commits a reading between dry-run analysis and historical import
- **THEN** atomic canonical conditional insertion prevents the import from overwriting it and reports an existing-canonical outcome.

### Requirement: Durable, safe, restartable migration
The importer SHALL offer deterministic dry-run and separately authorised execution, bounded batches and resumable checkpoints, using archive-first integrity and hot-store repair without changing collector progress.

#### Scenario: Interrupted mid-batch
- **WHEN** execution stops after an S3 commit but before the required hot write or checkpoint acknowledgement
- **THEN** restarting verifies archived data, completes safe repair and advances the checkpoint only for fully accepted work.

#### Scenario: Observation older than 365 days
- **WHEN** an accepted historical reading falls outside the rolling hot window
- **THEN** it is durably accessible in verified S3 history without requiring a new Dynamo hot observation.

#### Scenario: Backfill after normal live collection
- **WHEN** the importer processes historical months while normal ingestion continues
- **THEN** source collection cursors, health records and the live latest pointer do not regress or represent import work as a new source poll.

### Requirement: Reconciliation and coverage evidence
The importer SHALL report per-measurement ranges, accepted/duplicate/conflict/invalid counts, sampled parity, archive verification and known or unknown historical gaps for the read API.

#### Scenario: Missing source history vs missing committed archive
- **WHEN** a source never supplied an old interval
- **THEN** coverage may be partial/unknown and verified available rows remain queryable.
- **WHEN** a committed manifest references a missing or corrupt required archive object
- **THEN** the condition is an integrity error, not a successful partial gap.

### Requirement: No incidental production mutation
The change SHALL NOT start AWS deployment, production import, source deletion or live web cutover when its code or specification is merged.

#### Scenario: Implementation PR merged
- **WHEN** the future importer PR is merged without separately approved operator execution
- **THEN** source stores and production RDP data remain unchanged.
