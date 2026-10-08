# Spec Delta: Unified .NET river data platform foundation

> This retains the earlier `observation-collector-foundation` capability ID and `bootstrap-dotnet-observation-service` change slug for stable OpenSpec links. It now defines the shared platform foundation, **not** an observation-only architecture.

## ADDED Requirements

### Requirement: Independently buildable platform host
The system SHALL provide a .NET 10 Lambda foundation in one standalone repository that can be built and tested without the web app, legacy scraper, predictor or AWS credentials, and SHALL remain inert until a later domain change explicitly enables collection.

#### Scenario: Clean checkout
- **WHEN** an engineer restores, builds and tests a clean checkout without AWS credentials
- **THEN** CI/local validation succeeds without fetching environmental source data, invoking old code or creating cloud resources.

#### Scenario: No enabled collector
- **WHEN** a scheduled handler runs with no explicitly enabled observation or CSO collector
- **THEN** it returns an explicit disabled/not-configured outcome, records safe diagnostics and performs no upstream HTTP or persistence calls.

### Requirement: Shared infrastructure without a universal domain data model
The foundation SHALL support independent later domain modules for measurements, CSO operational state/events, model-neutral forecast publication and site assessments without forcing them into one storage schema, key model or retention policy.

#### Scenario: Observation and CSO code coexist
- **WHEN** later implementations add a measurement collector and a CSO collector in the same repository
- **THEN** each can use its own source and domain model, schedule and retention contract while sharing only appropriate hosting/config/health facilities.

#### Scenario: Independent prediction engine
- **WHEN** a model outside the platform publishes future predictions under a subsequently specified contract
- **THEN** the foundation does not require transferring model training or inference execution into .NET.

### Requirement: Stage and account isolation
Deployment tooling MUST verify stage, explicitly approved AWS account and region before changing AWS resources, and MUST keep new staging/production resources separate from `riverscraper` and existing production services.

#### Scenario: Incorrect AWS identity
- **WHEN** the authenticated AWS account or region differs from the approved target
- **THEN** any prepare/apply operation fails before mutating resources.

#### Scenario: Source merge or CI
- **WHEN** a PR or main branch commit runs CI
- **THEN** it builds/tests/validates only and never automatically creates AWS resources, applies change sets, enables a poll schedule or redirects a consumer.

#### Scenario: Explicit approval not granted
- **WHEN** a manual apply is not separately approved or a host schedule has not been deliberately enabled
- **THEN** no collection is activated and existing provider/consumer systems remain unchanged.

### Requirement: Safe operational diagnostics and config
The system SHALL validate stage and runtime configuration and emit structured, redacted invocation outcomes without secrets, credentials, raw source payloads or sensitive information.

#### Scenario: Invalid host configuration
- **WHEN** required stage/account/region or host options are absent or inconsistent
- **THEN** the runtime or deployment path fails safely with an actionable diagnostic and cannot silently collect from an unintended environment.
