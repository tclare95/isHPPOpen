# API-managed measurement configuration — product requirements

## ADDED Requirements

### Requirement: Three independent measurement decisions
RDP SHALL distinguish an approved registered measurement, its collection selection in each environment, and its visibility in that environment's private read catalogue. A change to any one SHALL NOT silently change either of the other two.

#### Scenario: Register without activation
- **WHEN** an authorised operator registers a valid supported measurement
- **THEN** it receives an immutable canonical identity but is not polled or automatically published.

#### Scenario: Publish without collecting
- **WHEN** a registered measurement is published but not selected for collection
- **THEN** ordinary authorised readers may discover it and query any retained data, without causing provider requests.

### Requirement: Safe selection for already registered measurements
RDP SHALL let authorised operators explicitly inspect, add or remove collection selections for already registered, supported measurements in the targeted environment, subject to workload and provider limits. Selection changes SHALL NOT require a simultaneous registration capability.

#### Scenario: Deselect a previously collected measure
- **WHEN** an operator removes a selected measurement
- **THEN** future collection runs do not poll it, its existing observations and durable cursor remain intact, and its former health is not misrepresented as a fresh successful attempt.

#### Scenario: Resume after a long pause
- **WHEN** collection is later re-enabled for a measurement whose cursor is beyond safe automatic lookback
- **THEN** RDP reports a held/backfill-required state rather than skipping history, overwriting the cursor or inventing continuity.

#### Scenario: Explicitly select nothing
- **WHEN** an authorised operator sets an intentionally empty selection in the managed model
- **THEN** collection for that environment safely polls nothing and reports a deliberate disabled selection, not a configuration failure. Missing, unvalidated or unreadable configuration remains an error.

### Requirement: Verified provider identity and stable registration
RDP SHALL offer bounded discovery or lookup of supported provider measurements and validate the exact source measurement identity, parameter, unit, datum and expected interval before registration or selection. Canonical IDs SHALL remain stable and SHALL NOT be reassigned to different upstream measurements. Only currently supported kinds can be registered.

#### Scenario: Ambiguous or unsupported upstream measure
- **WHEN** a provider has ambiguous candidate measures, unsupported semantics or unresolved identity
- **THEN** RDP rejects activation with actionable safe diagnostics; it does not guess from station name or poll the candidate.

#### Scenario: Duplicate identity or incompatible edit
- **WHEN** a proposed registration duplicates an existing upstream identity or attempts to repurpose an existing canonical ID
- **THEN** RDP refuses the change and preserves the prior registration and collected history.

### Requirement: Independent read-catalogue publication
RDP SHALL allow authorised operators to publish or unpublish registered measurements independently of collection. Ordinary read queries SHALL only access explicitly published measurements and SHALL NOT probe arbitrary storage using unpublished/unknown IDs.

#### Scenario: Unpublish while collecting
- **WHEN** an operator unpublishes a collected measurement
- **THEN** ordinary first-party readers no longer discover or query it, but permitted collection and stored history remain unchanged.

### Requirement: Effective state and truthful operational evidence
An authorised operator SHALL be able to inspect the **effective**, environment-specific registration, selection and publication decisions, their version/last-change evidence, collection health, last observed reading and available historical coverage. Unknown, stale, unavailable and not-yet-collected states SHALL not be reported as healthy or complete.

#### Scenario: Configuration applied or unavailable
- **WHEN** an operator inspects a configuration change or a collector cannot obtain trustworthy configuration
- **THEN** RDP identifies whether the change is effective and reports a safe failure/unknown state; it never silently broadens collection using an unverified fallback.

#### Scenario: Incomplete history
- **WHEN** collection began recently, was paused, or historical coverage has unresolved gaps
- **THEN** the operator view distinguishes verified coverage from unknown/missing periods and does not infer completeness from a latest reading.

### Requirement: Operator-only, isolated and concurrency-safe changes
RDP MUST restrict configuration writes to authorised operators in the intended environment. Staging and production write identities/configuration SHALL remain isolated. Ordinary first-party read identities SHALL NOT have configuration mutation permission. Concurrent changes SHALL be rejected or explicitly reconciled, never silently lost.

#### Scenario: Reader attempts mutation
- **WHEN** an ordinary first-party read principal attempts to change selection, registration or publication
- **THEN** RDP refuses the request without any configuration or collector side effect.

#### Scenario: Concurrent editors
- **WHEN** two operators attempt changes based on the same prior version
- **THEN** at most one can replace that version; the other receives a conflict and can inspect the new effective state.

### Requirement: Bounded and observable source collection
RDP MUST reject or hold configurations that exceed its approved workload, polling interval or provider request budgets and continue to report per-measurement collection failures without suppressing healthy peers.

#### Scenario: Over-capacity selection
- **WHEN** an operator proposes more collection work than the current safe runtime budget supports
- **THEN** RDP rejects activation with bounded capacity diagnostics; it does not deploy an implicitly enlarged collector.

### Requirement: Attributable and recoverable configuration history
Each accepted change MUST produce durable, attributable evidence of what changed, in which environment, when, and from which effective version. Operators SHALL be able to inspect changes and correct them without deleting observation history or resetting cursors. Rejected changes MUST not appear as effective.

#### Scenario: Operator reverses selection
- **WHEN** an authorised operator restores a previous selection after an unwanted change
- **THEN** the change is itself recorded and only future polling is affected; stored observations and prior cursor continuity are preserved.

### Requirement: Existing production remains unchanged before migration approval
The current six registered EA measurements, current approved selected collection and existing first-party read semantics MUST remain unchanged until an independently reviewed migration activates this control plane. Code/spec merging alone SHALL NOT modify the live collection plan or publish new measures.

#### Scenario: Specification or API code deployed without activation approval
- **WHEN** this OpenSpec merges or a later inert control API is deployed before a separately authorised collection migration
- **THEN** the existing collector, stage/prod isolation, release safeguards, schedule, data retention and read behaviour remain unchanged.
