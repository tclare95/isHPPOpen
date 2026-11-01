# Predictor canonical observation consumption — investigation requirements

## ADDED Requirements

### Requirement: Verifiable feature input equivalence
Before authorising RDP as the predictor's normal observation supplier, the system SHALL demonstrate that every required observation series has a stable, verified identity and compatible parameter, unit, datum, timestamp and sample semantics. A published catalogue entry without collected data SHALL NOT count as coverage.

#### Scenario: Similar station with different measurement
- **WHEN** RDP and direct EA present apparently corresponding series
- **THEN** the investigation proves exact measurement equivalence or marks it unresolved; station-name equality or unverified conversion is insufficient.

#### Scenario: Missing rainfall or history
- **WHEN** a required observation series, history window or proven identity is unavailable in RDP
- **THEN** migration remains blocked for that dependency, with an explicit prerequisite rather than invented values or silent removal of model features.

### Requirement: Freshness-preserving source selection
Any later RDP-first consumer SHALL retain the newest *eligible and verified* observation context within an agreed incident-safe freshness policy. It SHALL distinguish observed-at age, source publication lag, ingestion lag and read failure. RDP's generic `fresh` label alone SHALL NOT prove parity against direct EA.

#### Scenario: Canonical data behind direct EA
- **WHEN** the RDP observation is stale or materially behind a compatible official direct-EA reading at a forecast decision
- **THEN** the consumer can choose the independently verified direct-EA fallback without delaying the run or presenting the old RDP value as current; the source choice is observable.

#### Scenario: Both sources unavailable or incompatible
- **WHEN** neither source supplies a sufficiently trustworthy input
- **THEN** the forecast path visibly reports degraded or unavailable input, according to the existing output/alert contract, rather than synthesising zero or concealing an indefinitely forward-filled level.

### Requirement: Bounded, truthful history and revision treatment
The predictor SHALL be able to request bounded UTC observation history with actual gaps, provenance, stable identity, units and revision evidence, without treating a successful API response or empty coverage inventory as proof of a complete time series.

#### Scenario: Corrected or missing observation
- **WHEN** RDP returns a corrected observation, source gap, unknown coverage or a partially failed read
- **THEN** feature construction and diagnostics distinguish the condition and never silently reinterpret it as a newly measured current observation.

### Requirement: Time-ordered feature correctness
Any historical comparison used to approve source migration SHALL use time-ordered evaluation and SHALL NOT use an observation or forecast revision unavailable at the simulated forecast issue time as an input. If historic as-known-at evidence is unavailable, the result SHALL be labelled retrospective/hindsight rather than claimed to be leakage-free.

#### Scenario: Late correction and future rain
- **WHEN** a stored observation was corrected after the issue time, or actual future rainfall exists only after that issue time
- **THEN** it cannot enter an as-issued predictor feature set; weather forecasts must use an issue-appropriate vintage, or the test's limitation is explicit.

### Requirement: Independent, reversible adoption
Any later migration SHALL preserve the existing deployed model, cadence, output files, website/alert compatibility and separate release controls until a reviewed cutover. A failed RDP lookup SHALL NOT cause an unauthorised change of model or publication ownership.

#### Scenario: Shadow and rollback
- **WHEN** candidate RDP reads are compared or a later cutover fails the freshness/quality gate
- **THEN** the established direct-EA production path remains usable and reversion requires no model retraining or history rewrite.

### Requirement: Separate forecast publication responsibility
A future RDP forecast publish/query capability SHALL hold independently generated, model/provider-neutral forecast runs with issue time, target times, measurement identity/units, provenance, quality and applicable version/uncertainty evidence. It SHALL NOT require RDP to execute, train, schedule or promote Python models.

#### Scenario: Predictor publishes in the future
- **WHEN** an independently operated predictor elects to publish an approved forecast run to RDP
- **THEN** it remains responsible for inference and version selection, while RDP manages the accepted publication/query contract; existing S3 CSV consumers remain unchanged until separately migrated.
