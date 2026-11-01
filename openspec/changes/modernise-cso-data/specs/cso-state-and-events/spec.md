# Specification delta: CSO source evidence, monitor state and spill events

## ADDED Requirements

### Requirement: Poll only the reviewed, verified selection
The CSO system SHALL consume a deterministic #71 selection plan and attempt status collection only for assets that are eligible under its verified identities and environment-specific enabled sets. It SHALL keep collection independently controlled from catalogue discovery and existing gauge collection.

#### Scenario: New outfalls discovered
- **WHEN** a complete provider catalogue refresh discovers an outfall that is not in any enabled named selection set
- **THEN** no new CSO status polling or spill-event collection begins for it.

#### Scenario: Unresolved, disabled or duplicate selection
- **WHEN** an asset ID is unresolved, its only set is disabled, or the same resolved asset belongs to multiple enabled sets
- **THEN** unresolved/disabled assets are not polled, and the multiply selected eligible asset is planned at most once per cycle; diagnostics retain the reason and contributing sets.

#### Scenario: Stale last-good catalogue
- **WHEN** selection uses the last verified catalogue after a failed refresh
- **THEN** the source/version/staleness of that plan is visible, and a new or changed identity cannot be silently authorised.

### Requirement: Keep immutable source evidence separate from collection outcomes
The system SHALL retain auditable provider statements and their source/receipt provenance, with durable references to the original evidence. Poll-attempt success, unchanged source evidence, source freshness and successful durable persistence SHALL remain distinguishable.

#### Scenario: Identical reports
- **WHEN** repeated polling or queue retries return the same substantive provider report
- **THEN** collection outcomes remain observable without duplicate source claims, spill events or material event revisions.

#### Scenario: Source fetch succeeds without source update
- **WHEN** a request returns HTTP success but the provider's authoritative information has not advanced
- **THEN** the poll may be recorded as successful, but the source update age is not reset merely by fetching it.

#### Scenario: Invalid or partial provider response
- **WHEN** a provider response contains an embedded error, missing required identity, malformed event timestamp or inconsistent data
- **THEN** the claim is preserved or rejected from projection with a reasoned diagnostic; no unsupported current-state or event transition is published.

#### Scenario: One asset request fails
- **WHEN** one selected asset times out or is throttled while others succeed
- **THEN** the failure affects its own health/freshness and does not invalidate successfully committed independent assets.

### Requirement: Monitor state and spill-event lifecycle are independent
The system SHALL distinguish last reported monitor status, source/report freshness, effective present-tense confidence, collection health and spill-event lifecycle. The system MUST NOT infer a completed spill solely from a loss of telemetry or monitoring coverage.

#### Scenario: Reported active becomes stale
- **WHEN** the last validated report says spilling but no sufficiently fresh source statement exists
- **THEN** last reported spilling stays visible, effective current status becomes unknown, and the associated event is not closed.

#### Scenario: Monitor offline, source unavailable or collection disabled
- **WHEN** an active event is followed by an offline report, fetch failure, absent report, stale status, disabled selection or elapsed time
- **THEN** no authoritative end is invented, the event is retained as ongoing or unresolved, and the current view does not claim not-spilling.

#### Scenario: Fresh authoritative stopped status with no event end
- **WHEN** a source says monitoring is currently not spilling but gives no trustworthy end boundary for a previously open event
- **THEN** the current reported status can change, but the event is not given a precise completion timestamp without sufficient event-end evidence.

### Requirement: Prefer provider-reported event boundaries while preserving uncertainty
The system SHALL use valid source-reported start/end claims where available, including completed spills entirely between polls, and SHALL not fabricate precise boundaries or durations from collection timestamps.

#### Scenario: Complete event first seen after it ended
- **WHEN** a new report contains a valid event start and end both after the previous poll and before the current poll
- **THEN** exactly one completed event is recognised using the source boundaries even if no spilling status was polled.

#### Scenario: No trustworthy boundary or impossible interval
- **WHEN** a claim lacks an exact boundary, claims an end before its start, or mixes incompatible timestamp semantics
- **THEN** uncertainty or invalidity is represented explicitly, previously valid events remain intact, and no precise invented time or duration is published.

#### Scenario: Event never represented by source
- **WHEN** a discharge occurred but no fetched source report contains evidence of it
- **THEN** the platform does not assert that the event was observed or that polling proves complete spill coverage.

### Requirement: Stable event identity, material revisions and explicit reconciliation
The system SHALL retain one stable internal identity per evidenced discharge, retain immutable material event revisions, and avoid destructive overwrite or silent merging when provider evidence is duplicate, conflicting, out of order or ambiguous.

#### Scenario: Provider corrects completed boundaries
- **WHEN** a later authoritative claim unambiguously corrects a completed event's start, end or completion status
- **THEN** its internal ID remains stable, the authoritative version advances, and the prior version and source evidence remain auditable.

#### Scenario: Replayed older claim
- **WHEN** a previously processed report is retried after a newer authoritative correction
- **THEN** it cannot roll the event backwards, create a second event or discard a material revision.

#### Scenario: Two distinct nearby discharges
- **WHEN** two independently evidenced discharge intervals are close together
- **THEN** they remain separate if the evidence distinguishes them; time proximity alone does not combine them.

#### Scenario: Ambiguous match or conflicting authority
- **WHEN** a corrected start/end could refer to multiple events, or two contradictory reports have no established authoritative ordering
- **THEN** all source claims remain auditable, affected event identity/transition stays unresolved, and no arbitrary merge, closure or confident count is published.

#### Scenario: Concurrent duplicate identity creation
- **WHEN** two collectors or retries attempt to materialise the same newly identified discharge concurrently
- **THEN** only one canonical event identity is ultimately published, with no orphaned or lost evidentiary claims.

#### Scenario: Concurrent late correction
- **WHEN** multiple valid and conflicting revisions are processed concurrently or out of order
- **THEN** committed authoritative state and its revision chain remain consistent; inconclusive ordering is surfaced for reconciliation instead of silently choosing a winner.

### Requirement: Acknowledged CSO state is recoverable after partial failures
The system SHALL not acknowledge a status or event projection as durable until its associated source evidence is durably and verifiably retained. Recovery and replay SHALL converge without duplicate or missing material revisions.

#### Scenario: Evidence write or verification fails
- **WHEN** immutable S3 evidence cannot be committed or verified
- **THEN** the durable source/event checkpoint does not advance, prior state remains readable, and the attempt can safely be retried.

#### Scenario: Evidence succeeds but Dynamo projection fails
- **WHEN** source evidence commits but current state, event head or query indexing only partially succeeds
- **THEN** replay can complete the missing projection consistently, without duplicating identities or revisions or exposing a falsely completed event.

#### Scenario: Retry after uncertain acknowledgement
- **WHEN** a caller retries after timeout or lost acknowledgement
- **THEN** already committed evidence/events are recognised and no additional user-visible event or revision is fabricated.

### Requirement: No implicit legacy cutover
The new CSO module SHALL leave the legacy Node scraper, Mongo snapshots, public water-quality responses and alert delivery unchanged until separately approved migration.

#### Scenario: Stage-only CSO module deployed
- **WHEN** the new module is made available to an authorised stage environment
- **THEN** it does not modify the existing legacy writes, existing schedules, alerts, or public CSO consumers.
