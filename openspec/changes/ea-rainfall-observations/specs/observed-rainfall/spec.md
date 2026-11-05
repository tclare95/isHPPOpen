# Observed rainfall measurement — product requirements

## ADDED Requirements

### Requirement: Rainfall is a period accumulation, not an instantaneous observation
RDP SHALL distinguish observed rainfall totals from instantaneous level/flow samples. A supported 15-minute rainfall reading SHALL preserve its native time label, source-confirmed interval interpretation, 900-second accumulation duration, value in mm, and source measurement identity. RDP MUST NOT infer a start/end alignment until the provider convention is established; it MUST NOT publish period totals as instantaneous observations.

#### Scenario: New rainfall series
- **WHEN** a verified rainfall total series is registered
- **THEN** its stable source/measure identity, period, unit and value type are independently represented, without changing existing level/flow semantics.

#### Scenario: Timestamp convention unresolved
- **WHEN** a source has not established whether a reading label is period start or period end
- **THEN** RDP retains the original UTC time label and duration but does not offer a fabricated interval boundary or a prediction-ready accumulated window.

### Requirement: Validated origin and source-specific qualifications
RDP SHALL verify the provider station and measure, the observed property, total value type, unit and 15-minute interval before permitting selection for collection. It SHALL retain source name, original reading reference, original numeric representation, observation quality, completeness, additional qualifiers and first-known/ingestion evidence where available.

#### Scenario: Invalid or ambiguous source identity
- **WHEN** a proposed rain series cannot be unequivocally matched to official metadata
- **THEN** it is held from activation, not guessed from a site name or an unrelated Flood Monitoring station.

#### Scenario: Qualified but incomplete reading
- **WHEN** Hydrology marks a reading `Missing`, `Incomplete` or otherwise questionable
- **THEN** the qualification is visible and does not silently become a trusted dry interval.

### Requirement: Missing intervals are unknown
Time-bounded rainfall histories SHALL expose the expected 15-minute grid and any missing, unavailable, incomplete or conflicting intervals. Rainfall sums SHALL be complete only where every required eligible interval is known; a zero SHALL mean an observed and eligible numeric zero, not a data gap. The consumer SHALL be able to detect an unusable context window without interpolating rainfall.

#### Scenario: Sparse provider readings
- **WHEN** 3 of 4 expected 15-minute readings exist
- **THEN** a one-hour accumulation cannot be represented as a complete total by assuming the missing interval received 0 mm.

### Requirement: Corrections and forecast-time availability remain attributable
RDP SHALL preserve received evidence and distinguish later corrected/requalified values from those known at a prior forecast issue time. The latest revision SHALL NOT automatically be offered as historically available at that issue time. Where prior availability cannot be proved, replay must be labelled unknown/hindsight rather than reconstructing a fictional original input.

#### Scenario: Corrected historic rainfall
- **WHEN** EA revises a previous 15-minute total after a forecast was issued
- **THEN** the correction is auditable without silently changing the reconstructed as-known-at forecast context.

### Requirement: Freshness and coverage are measured, not presumed
RDP SHALL make source observation age, publication availability when observable, collection/ingestion delay and verified historical coverage distinguishable. Neither the nominal 15-minute measurement period nor a successful HTTP request alone establishes operational freshness.

#### Scenario: Delayed rainfall publication
- **WHEN** the newest provider rain measurement is hours old
- **THEN** consumers see stale/unknown operational eligibility, not a claim of near-real-time rainfall.

### Requirement: Additive, bounded and independently activated
Any future collection SHALL be limited to explicitly validated, operator-selected series, preserve per-stage isolation and cursors, and respect provider fair-use and RDP workload budgets. Registration SHALL NOT imply collection or read publication. Current production level/flow collection and existing read endpoints SHALL remain unchanged before separate approval.

#### Scenario: Foundation PR merges
- **WHEN** rainfall model/provider fixtures merge without an activation change
- **THEN** zero additional provider requests, AWS writes, collection jobs, published readings or predictor modifications occur.

### Requirement: Forecast producer remains separate
RDP SHALL expose observed precipitation data as source evidence, not as model features or predicted rainfall. The predictor retains its own feature construction, future yr.no rainfall, training, inference and forecast publishing.

#### Scenario: Future RDP predictor shadow
- **WHEN** #53 compares direct EA against RDP
- **THEN** any observed rainfall input must carry source identity, period, gaps and availability evidence; no forecast is republished or retrained by this change.
