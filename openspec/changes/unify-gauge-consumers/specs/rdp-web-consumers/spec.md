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

### Requirement: Alert-safe per-measurement evaluation
Live gauge alerts MUST select one authoritative source per evaluation, MUST NOT reuse read-only display fallback or stale display snapshots, and MUST validate observations independently for each gauge. Only measurements with verified identity, units, acceptable quality and a valid observed timestamp no more than 30 minutes old may affect alert state. Unusable measurements MUST NOT trigger, rearm or advance their dependent rules.

#### Scenario: Some sources unusable
- **WHEN** one gauge is stale/unknown/invalid while another gauge, forecast, HPP or water-quality source is usable
- **THEN** the unusable gauge rules do not change and all unrelated eligible rules continue.

#### Scenario: Repeated unchanged observation
- **WHEN** several 15-minute cron runs see the same observation
- **THEN** they do not repeat a notification, rearm the rule or advance observation progress.

### Requirement: Preserve and reconcile existing alert state
The migration MUST preserve subscription status, existing triggered/armed state, hysteresis, alert keys and delivery history. It SHALL track processed source-observation progress durably, reject older/conflicting readings, and use bounded chronological catch-up without silently skipping unknown state. Only a crossing still met by the **latest eligible fresh observation** may result in a catch-up email.

#### Scenario: Existing state cannot be reconciled
- **WHEN** an existing subscription lacks an observation marker and trustworthy historical evidence cannot establish continuity
- **THEN** the affected rule is held for review without a manufactured crossing, reset or rearm.

#### Scenario: Late observations contain a transient crossing
- **WHEN** a bounded catch-up reveals a past threshold crossing but the latest fresh observation has already cleared
- **THEN** no retrospective notification is sent.

#### Scenario: Insufficient catch-up evidence
- **WHEN** history is over budget, incomplete for a required state decision, or conflicts at the same timestamp
- **THEN** the rule is held without silently advancing beyond uncertain progress.

### Requirement: Safe source switching and rollback
Source selection MUST remain fixed through an evaluator invocation. A source change from legacy to RDP or back MUST NOT itself count as a crossing or rearm; it SHALL require demonstrated observation/condition continuity or operator-reviewed reconciliation. A newer but inconsistent reading is not sufficient, and old and new deployments MUST NOT concurrently overwrite authoritative state.

#### Scenario: RDP-to-legacy rollback
- **WHEN** legacy returns older readings or later readings inconsistent with the accepted RDP state
- **THEN** affected rules are held without trigger/rearm/send, while independent alert types remain operational.

### Requirement: #47 reliability prerequisite and uncertain delivery
The separately reviewed reliability-only implementation under #47 MUST precede live RDP alert activation and prove safe overlapping-run, delivery-intent and subscription-state handling. It MUST NOT require the optional five-minute cron change. Delivery identity remains stable across equivalent source readings. After provider idempotency protection expires, uncertain sends MUST be held for operator review instead of blindly retried.

#### Scenario: Concurrent runs or uncertain provider response
- **WHEN** overlapping cron runs evaluate the same crossing, or provider acceptance is uncertain
- **THEN** there is no independent duplicate delivery intent, state writes remain consistent, and recovery does not blindly resend after idempotency expiry.

### Requirement: Shadow comparison with zero shadow side effects
In `shadow` mode legacy SHALL remain authoritative. The additional RDP comparison MUST NOT write subscriptions, deliveries, `alertRuns`, observation progress or send notifications; a shadow failure MUST NOT interrupt authoritative legacy evaluation.

#### Scenario: RDP shadow fails or disagrees
- **WHEN** the RDP shadow fetch fails or produces an inconsistent decision
- **THEN** the discrepancy is safely recorded, with no RDP-shadow state/delivery side effects and no change to the legitimate legacy evaluation.

### Requirement: Evidence-based independently approved rollout
The website SHALL preserve existing public HTTP envelopes and 900-second operational cache baseline and require independently reviewable cutover and rollback evidence for each consumer.

#### Scenario: Dashboard migration gate
- **WHEN** a dashboard switch is proposed
- **THEN** all six measurement IDs and recent history are verified, a bounded approximately 48h shadow comparison plus sampled 7d history exists, and no unexplained value/identity discrepancy is outstanding before activation.

#### Scenario: Production backend not approved
- **WHEN** the RDP backend is only fixture-tested or stage-deployed but production collection/read IAM have not been explicitly approved
- **THEN** no production consumer source is switched to RDP.
