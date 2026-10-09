# Specification delta: Low-footprint integration deployment

## ADDED Requirements

### Requirement: On-demand minimal integration environment
The platform SHALL support a stage-isolated, mostly idle integration environment for explicit, bounded AWS end-to-end verification without requiring a full production-rate collector or production history replica.

#### Scenario: Inert foundation deployed
- **WHEN** an authorised operator applies a reviewed Stage-A SAM change set
- **THEN** the Lambda is invokable as Disabled, the EventBridge rule stays disabled, and no EA/CSO polling or Dynamo/S3 data activity occurs.

#### Scenario: Production and stage share an AWS account
- **WHEN** both stages are hosted in the same approved account
- **THEN** different stacks/roles/tables/buckets or strictly protected namespaces prevent staging writes or deletes against production/legacy resources.

#### Scenario: Test collection deliberately enabled
- **WHEN** a stage collection test is explicitly invoked
- **THEN** only allowlisted selected measurements/assets are polled for a bounded number of runs and collection returns to disabled state afterwards.

### Requirement: Domain retention invariants unaffected by test data cleanup
The platform MUST preserve production archival and domain retention policies while permitting separately approved cleanup of labelled disposable stage-only fixtures.

#### Scenario: Old observation history simulated
- **WHEN** a 365-day observation archival boundary is tested in the integration environment
- **THEN** injected time and small historical fixtures prove archive verification and hot expiry without requiring 365 days of real stage polling.

#### Scenario: Old CSO history simulated
- **WHEN** the CSO event hot/archive cutoff is tested
- **THEN** historical fixtures verify 24 UTC calendar months after confirmed event end, while open/unresolved events remain non-expiring.

#### Scenario: Stage-only cleanup requested
- **WHEN** an operator approves deletion of disposable stage test evidence after its checks have completed
- **THEN** only explicitly scoped stage items may be removed, with verified stage/account/resource protections, and canonical production/legacy history is unaffected.

### Requirement: Manual review and cost safeguards
The platform SHALL require an explicitly approved target, independently reviewed release steps, visible cost/resource bounds and a disabled/rollback end state for integration AWS changes.

#### Scenario: Normal merge
- **WHEN** a PR or main merge completes
- **THEN** CI does not automatically prepare/apply AWS resources or enable live source collection.

#### Scenario: Stage-A approval only
- **WHEN** approval covers only the inert foundation stack
- **THEN** additional tables, data collection and archive writes cannot be assumed authorised.

#### Scenario: Unexpected stage resource or spend
- **WHEN** a proposed deployment contains an unreviewed always-on service, wildcard production data permission or unexpected significant recurring cost
- **THEN** prepare/apply or smoke activation is held for explicit review and correction.
