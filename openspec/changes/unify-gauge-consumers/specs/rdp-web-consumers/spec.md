# Spec Delta: RDP gauge consumers for isHPPOpen

## ADDED Requirements

### Requirement: Authenticated first-party RDP client
The website MUST call RDP only from trusted server-side code using short-lived AWS credentials and SigV4; Preview and Production MUST be isolated and no credentials shall appear in browser-visible responses.

#### Scenario: Wrong environment or unauthorised request
- **WHEN** a Preview deployment tries production RDP or signing credentials are missing/invalid
- **THEN** RDP rejects access and the web records a safe error without leaking credentials or silently using the wrong stage.

### Requirement: Independent, reversible per-consumer source configuration
The website SHALL select `legacy`, `shadow` or `rdp` independently for Trent, observed levels and gauge alerts via validated server-side Vercel environment settings defaulting to `legacy`.

#### Scenario: Dashboard activated without alert cutover
- **WHEN** Trent is configured `rdp` but alerts and observed levels remain `legacy`
- **THEN** each consumer uses its own selected source and rollback of Trent does not change the others.

#### Scenario: Configuration rollback
- **WHEN** an operator changes one consumer's server-side source configuration and deploys the change
- **THEN** the affected consumer returns to legacy behaviour after deployment/cache propagation without altering other consumers or deleting RDP records.

### Requirement: Shadow evaluation has no user side effects
Shadow mode SHALL preserve legacy as the authoritative served/evaluated source while comparing bounded RDP results at equal observed timestamps and keeping all state/delivery unchanged.

#### Scenario: RDP shadow read fails
- **WHEN** RDP times out or returns integrity failure during shadow evaluation
- **THEN** legacy display/alert operation continues and the comparison records the failure without mutating subscriptions, alerts or user responses.

#### Scenario: Snapshot request times differ
- **WHEN** legacy and RDP contain equal readings at the same observed timestamps but were retrieved at different HTTP times
- **THEN** the comparison reports equality of those readings and separately reports latest-observation lag.

### Requirement: Backwards-compatible Trent output and honest display fallback
The website SHALL preserve all six series in the `/api/trentweirs` contract, newest-first data and existing derived value semantics while using a complete-series source selection and accurately reporting freshness/fallback.

#### Scenario: RDP history is oldest-first
- **WHEN** the internal API returns chronological pages
- **THEN** the public adapter emits the existing newest-first bounded 672-point series, correct units and the existing 1h/1d calculation/rounding contract.

#### Scenario: Only one series unavailable
- **WHEN** one RDP measurement fails but its complete legacy series is fresh and valid
- **THEN** that series may fall back without mixing individual RDP/EA points or dropping healthy other RDP series, and the response identifies partial/fallback origin.

#### Scenario: Cached fallback is old
- **WHEN** a legacy last-successful display snapshot exceeds the 30-minute freshness baseline
- **THEN** it is visibly stale (or unavailable) and MUST NOT be represented as fresh merely because it is fallback data.

### Requirement: Independently sourced observed levels and legacy forecast
The website SHALL migrate only observed Colwick `level_data` to RDP while preserving the separate legacy `forecast_data` and existing `/api/levels` response fields.

#### Scenario: Forecast unavailable but observed levels healthy
- **WHEN** the existing forecast source fails while RDP observations are usable
- **THEN** the public response retains observed readings and communicates the forecast failure separately, without manufacturing forecast values.

### Requirement: Alert source failure and switching never manufacture events
Live gauge alerts MUST use a fixed selected source for each evaluation, MUST NOT inherit dashboard automatic legacy fallback and MUST skip unsafe affected rules without triggering, rearming or mutating their last condition state.

#### Scenario: Gauge unhealthy while other alert domains healthy
- **WHEN** one selected RDP measurement is stale or unavailable but other gauge measurements and independent HPP/forecast/water sources are healthy
- **THEN** only rules depending on that measurement are skipped; valid other alerts continue using their original semantics.

#### Scenario: Source switch replays older observation
- **WHEN** a rollback or cache replay produces an observedAt no newer than an already evaluated reading
- **THEN** the rule does not rearm or send a new alert merely because the data source changed, and delivery idempotency remains effective.

#### Scenario: RDP alert shadow evaluation
- **WHEN** alert source mode is `shadow`
- **THEN** RDP condition comparisons are recorded without writing any alert/run/delivery state or sending email from the shadow path.

### Requirement: Evidence-based independently approved rollout
The website SHALL preserve existing public HTTP envelopes and 900-second operational cache baseline and require independently reviewable cutover and rollback evidence for each consumer.

#### Scenario: Dashboard migration gate
- **WHEN** a dashboard switch is proposed
- **THEN** all six measurement IDs and recent history are verified, a bounded approximately 48h shadow comparison plus sampled 7d history exists, and no unexplained value/identity discrepancy is outstanding before activation.

#### Scenario: Production backend not approved
- **WHEN** the RDP backend is only fixture-tested or stage-deployed but production collection/read IAM have not been explicitly approved
- **THEN** no production consumer source is switched to RDP.
