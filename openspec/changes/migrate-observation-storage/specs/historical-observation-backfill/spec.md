# Spec Delta: Historical gauge observation backfill

## ADDED Requirements

### Requirement: Inventory reasonably available source history

The system SHALL support bounded read-only inventory of accessible legacy Mongo/S3 evidence and supported official EA historical readings, showing available ranges, limitations and excluded sources. Initial import eligibility SHALL be limited to Colwick; the other registered measurements may be inventoried without becoming import targets.

#### Scenario: Repeated history and inaccessible source
- **WHEN** snapshots repeat a reading across many saved runs
- **THEN** the inventory counts the evidence without claiming additional observations.
- **WHEN** a source or interval cannot be inspected
- **THEN** that limitation is reported as unavailable or unknown, not silently treated as an empty period.

### Requirement: Verified measurement identity and truthful provenance

Every eligible reading SHALL map to a registered measurement, its original observed UTC timestamp, numeric value and compatible parameter, unit and datum. The system SHALL preserve source references and uncertainty about original fetching rather than constructing source evidence it does not possess.

#### Scenario: Colwick station alias
- **WHEN** a candidate originates from the government gauge page identified as station 2102
- **THEN** the known Colwick 2102/4009 station alias is recognised, but its measured series, units and datum must still be established before admission.
- **WHEN** that equivalence cannot be established
- **THEN** the affected candidate is quarantined, not silently converted.

#### Scenario: Cached-only observations
- **WHEN** a snapshot repeats a previously cached level reading and its measurement identity is verified
- **THEN** the reading may be considered lower-confidence gap-fill; `model_date`, `level_source` and snapshot storage time are not represented as its original direct EA fetch.

### Requirement: Deterministic selection and conflict reporting

For each registered `measurementId + observedAt UTC`, the system SHALL deduplicate equivalent readings while retaining evidence, use a documented, deterministic precedence among verified candidates, and hold unresolved same-priority conflicts for review. An apparently stronger import candidate SHALL NOT take precedence over an occupied canonical RDP identity.

#### Scenario: Duplicate evidence
- **WHEN** the same observed value occurs in 100 compatible snapshots
- **THEN** at most one import candidate remains and the evidence summary records the duplicates.

#### Scenario: Contradictory candidates
- **WHEN** two eligible candidates have materially different values and neither has decisive higher-priority evidence
- **THEN** neither is imported automatically; both values and their provenance appear in the review report.

### Requirement: Canonical observations are never changed by automatic import

The importer MUST add only absent canonical identities and MUST NOT change any existing canonical value, revision or evidence, including when the existing value is identical. It SHALL preserve live collection behaviour during concurrent imports. Corrections to existing canonical observations require a separate authorisation and workflow.

#### Scenario: Existing canonical identity
- **WHEN** the archive already contains an observation for the candidate measurement and timestamp
- **THEN** it is retained unchanged and reported as already canonical or conflicting; import does not rewrite its evidence.

#### Scenario: Live collector wins the race
- **WHEN** live collection commits a reading after dry-run but before conditional import
- **THEN** the importer preserves the collector's committed reading and reports the new occupancy or conflict.

### Requirement: Reviewed, bounded and restartable import

The system SHALL provide a reproducible dry-run report and separately authorised, bounded execution of that reviewed scope. It SHALL verify archive durability before making any eligible hot representation available, support safe restart after partial progress, and refuse unauthorised or materially altered plans.

#### Scenario: Interrupted archive-first execution
- **WHEN** a batch has committed to the archive but import stops before hot persistence or checkpoint completion
- **THEN** replay identifies the existing committed readings, verifies them, safely completes eligible missing work and never re-creates an existing canonical revision.

#### Scenario: Historical hot boundary
- **WHEN** an eligible observation is outside the rolling 365-day hot range
- **THEN** it remains available through verified archive history without requiring a new hot row.

#### Scenario: Existing hot row without archive evidence
- **WHEN** hot storage contains a timestamp without corresponding committed canonical archive history
- **THEN** import holds that inconsistency for review and does not overwrite it.

### Requirement: Keep import separate from live operations and outage recovery

Historical import SHALL NOT change live cursor, collection health or latest pointers, acknowledge operational outage gaps, or resume a held collector. Normal recovery and ordinary collection SHALL remain independent.

#### Scenario: Import while collection continues
- **WHEN** a historical month is imported during a live collection run
- **THEN** normal collector progress and health are unaffected, and imported history does not masquerade as a current source poll.

### Requirement: Honest reconciliation and separately reviewed coverage publication

The system SHALL report accepted, already-canonical, conflicting, invalid and unavailable candidates; source evidence; observed-time ranges; archive verification; and known or unknown history gaps. It SHALL produce evidence-backed coverage recommendations for separate review, without automatically publishing `complete` intervals or changing the read API's existing coverage inventory.

#### Scenario: Unavailable source history versus broken archive
- **WHEN** no recoverable source evidence is available for an interval
- **THEN** the interval can remain unknown or be labelled with a supported gap reason, while verified neighbouring observations remain readable.
- **WHEN** committed canonical archive content is missing or corrupt
- **THEN** the reader/importer reports an integrity failure rather than a legitimate source gap.

#### Scenario: Completed import with intermittent samples
- **WHEN** all approved candidates are imported but source intervals are not proven complete
- **THEN** import completion does not imply complete historical coverage.

### Requirement: No automatic deployment or data mutation

Publishing this specification, merging implementation or deploying code SHALL NOT start private data inventory, production imports, source deletion or consumer cutover without separate explicit operator authorisation.

#### Scenario: Slice A or B merged
- **WHEN** a documentation or code PR is merged without execution approval
- **THEN** legacy sources, RDP canonical history and production operation remain unchanged.

