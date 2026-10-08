# Spec Delta: Observation collector foundation

## ADDED Requirements

### Requirement: Independent .NET collector host
The system SHALL provide a .NET 10 Lambda host that can be built and tested without the existing scraper, predictor, web process or production AWS credentials.

#### Scenario: Development from a clean checkout
- **WHEN** an engineer restores/builds/tests the collector from a clean checkout with supported SDK and no AWS session
- **THEN** the host and tests run, and no source polling or cloud resource creation occurs.

#### Scenario: Feature not configured
- **WHEN** the scheduled host executes without any enabled measurement collector
- **THEN** it records a clear not-configured result and does not write data or call the legacy scraper.

### Requirement: Environment and account isolation
The deployment tooling MUST assert stage, AWS account and region before applying infrastructure and MUST isolate stage resources from production and from legacy `riverscraper`.

#### Scenario: Wrong AWS credentials
- **WHEN** the authenticated AWS account or region does not match the explicitly approved target for the requested stage
- **THEN** deployment fails before any resource mutation.

#### Scenario: Normal source merge
- **WHEN** a pull request is merged or a commit is pushed to main
- **THEN** CI builds/tests/validates but does not automatically apply an AWS change set, activate scheduling or switch consumers.

### Requirement: Safe operational diagnostics
The collector SHALL emit structured invocation outcomes without exposing credentials, raw secret configuration or sensitive upstream payloads.

#### Scenario: Startup configuration error
- **WHEN** required host configuration is absent or inconsistent
- **THEN** the invocation fails with an actionable, redacted diagnostic and cannot silently collect into the wrong environment.
