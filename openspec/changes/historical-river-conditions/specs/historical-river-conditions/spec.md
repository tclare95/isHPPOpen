# Historical river conditions — product requirements

## ADDED Requirements

### Requirement: Historical levels are explorable from a verified measurement
isHPPOpen SHALL let a visitor explore the available Colwick observed-level history by a selected calendar period and inspect a smaller interval in more detail. It SHALL identify the source measurement and units, and preserve observation chronology and genuine gaps.

#### Scenario: Selecting a historical period
- **WHEN** a visitor chooses a Colwick year or month with available RDP observations
- **THEN** the page shows the correct dated observations and a useful overview, with a way to inspect individual intervals at greater resolution.

#### Scenario: No data, failed read or partial archive
- **WHEN** a requested interval has no observations, is partially known, or RDP reports a storage/integrity/query failure
- **THEN** the UI distinguishes these outcomes and does not fabricate, interpolate or silently truncate an apparently complete history.

### Requirement: HPP threshold statistics describe observed level conditions, not operational closures
For Colwick, isHPPOpen SHALL show level-derived summaries relative to the current **2.2 m** HPP threshold (below = below threshold; at or above = threshold met). It SHALL call these historical **river-level conditions**, not actual course opening/closure decisions, and keep the transition-based HPP history separate.

#### Scenario: Known, continuous eligible observations
- **WHEN** a selected month has sufficient time-bound observations and coverage evidence
- **THEN** the product can report time at/above 2.2 m, its denominator and the period covered, without substituting rounded event counts or one-off sample totals for elapsed time.

#### Scenario: Unsupported interval between readings
- **WHEN** the observations contain a gap or uncertainty whose duration cannot be verified
- **THEN** that interval contributes to unknown time, not automatically to below-threshold or above-threshold time; the summary discloses incomplete coverage and does not claim a full-month or full-year percentage.

#### Scenario: Operational HPP history differs
- **WHEN** a historical level was below 2.2 m but HPP was closed for another reason, or a legacy status transition differs
- **THEN** the level-derived view does not rewrite the operational HPP record or imply course availability.

### Requirement: Seasonal context is attributable and comparable
isHPPOpen SHALL provide historical context for Colwick levels, including period-appropriate central tendency and distribution where supported, showing what historical years and eligible observations contribute. It SHALL not compare unrelated measure identities, units or datum conventions.

#### Scenario: Comparing current conditions with earlier seasons
- **WHEN** a visitor requests a November comparison and comparable qualified historical observations exist
- **THEN** the visitor can see the historical seasonal range and how the chosen observed level relates to it, with the reference years and source clearly identified.

#### Scenario: Inadequate comparison evidence
- **WHEN** the history is too sparse, provisional or inconsistent to support an honest percentile or a seasonal label
- **THEN** the product shows an unavailable/limited comparison rather than a misleading "normal", "record" or percentile claim.

### Requirement: Historical evidence quality and completeness remain visible
The product SHALL distinguish (a) successfully returned archived observations, (b) formally supported coverage intervals, (c) provider reading quality/revisions, and (d) query failures. It SHALL not infer official completeness merely from observed 15-minute cadence or a successful archive read.

#### Scenario: Reviewed coverage is not yet published
- **WHEN** RDP history returns rows while its coverage inventory classifies the period as `unknown`
- **THEN** the UI may present those historical observations and provisional derived summaries, but does not label the entire period as officially complete.

#### Scenario: Edited or revised official reading
- **WHEN** an observation is qualified/edited by the upstream provider or a later canonical revision changes the historical result
- **THEN** the displayed interpretation remains attributable to the currently returned evidence and does not purport to recreate the exact original real-time announcement.

### Requirement: Historical presentation preserves existing live contracts
Historical exploration SHALL NOT change live observed level/forecast API responses, authoritative HPP status, subscriber state, gauge alerts, or historical transition records. Static historical tables SHALL only be replaced when new statistics can be reconciled and responsibly labelled.

#### Scenario: Live sources are unavailable
- **WHEN** a historical lookup fails independently of the live status view
- **THEN** the historical feature degrades separately; current status, forecast and alerts retain their established behaviour.
