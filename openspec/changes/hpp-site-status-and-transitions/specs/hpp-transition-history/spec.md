# HPP transition history — product requirements

## ADDED Requirements

### Requirement: Preserve a continuous, identifiable transition history
The HPP service SHALL preserve the historical open/closed transition sequence from legacy `openIndicator`, without silently truncating or rewriting events. New transitions SHALL be attributable to the deciding evidence and shall distinguish observation time from evaluation/publication time.

#### Scenario: An eligible boundary crossing
- **WHEN** a verified eligible observation indicates a different open/closed state from the established prior state
- **THEN** exactly one new authoritative transition is recorded, with sufficient identity, rule and time/provenance evidence for audit.

#### Scenario: Replay, late data or ambiguous sequence
- **WHEN** eligible input is repeated, late, out of order, corrected or inconsistent with an established transition sequence
- **THEN** no duplicate or speculative event is created; unresolved ambiguity is held for reconciliation, not silently rewritten.

### Requirement: Closure windows include the state carried into the window
The service SHALL support correct status and closure-duration calculations for the existing 7-, 28-, 182- and 365-day windows, using the last valid transition **before** the requested window start when needed.

#### Scenario: No event inside the window
- **WHEN** the state stayed closed or open throughout a requested window
- **THEN** calculations reflect that carried-in state, rather than returning unknown merely because no in-window event exists.

#### Scenario: A window begins during a closure
- **WHEN** the last event before the cutoff was closure and the first in-window event was reopening
- **THEN** the closure interval from the cutoff to reopening contributes to the requested duration.

### Requirement: Keep public history consumers compatible through migration
The website SHALL retain its existing `/api/hppstatus` response shape and usable HPP alert semantics while it changes data sources. Any correction to existing confusing field semantics (including legacy last-changed/last-open labels) requires explicit reviewed contract evidence, not a silent breaking rename.

#### Scenario: Shadow evaluation
- **WHEN** the new service evaluates HPP readings while the Node writer is authoritative
- **THEN** it produces comparison/diagnostic evidence only and SHALL NOT write to the authoritative historical stream, change alert subscription/progress/delivery records or send emails.

#### Scenario: Cutover and rollback
- **WHEN** a newly authorised HPP writer or reader is activated or rolled back
- **THEN** a single writer remains authoritative, historical state is reconciled and existing alerts do not rearm, resend or replay because of the switch.

### Requirement: Gaps remain visible
Historical completeness SHALL not be asserted when legacy event history or source continuity is unverified.

#### Scenario: Missing seed or ambiguous boundary
- **WHEN** the predecessor state, source continuity or cutover handoff cannot be established
- **THEN** the affected calculation or transition is held/marked uncertain with a review path; it is not silently seeded as open, closed or freshly evaluated.
