# Capability: Browsable CSO event history

## ADDED Requirements

### Requirement: Navigate available event history
The existing `/waterquality` event-history view SHALL allow a visitor to move through older and newer reported events without being restricted to the initial returned batch.

#### Scenario: More events than one response
- **WHEN** a filter has more eligible events than one response can contain **THEN** the visitor can retrieve subsequent events through a clear pagination or continuation control, with no silent cap masquerading as complete history.

#### Scenario: Time range and outfall selection
- **WHEN** a visitor changes the time range or selected outfall **THEN** navigation restarts at an appropriate position for the new query and displays only relevant events. Existing short-window options remain available.

#### Scenario: Navigation and details
- **WHEN** a visitor explores another page and opens an event **THEN** its status, reported times, revisions and existing map/downstream-route interactions retain their meaning.

### Requirement: Report history faithfully
The view SHALL distinguish the absence of reported events from unavailable or incompletely retrieved evidence.

#### Scenario: Partial coverage or truncation
- **WHEN** events, monitoring periods or provider history are incomplete, stale, unread or truncated **THEN** the page identifies the limitation instead of reporting the period as spill-free or presenting a misleading total.

#### Scenario: Ordering, overlap and correction
- **WHEN** events overlap a requested range, remain ongoing, or are corrected between reads **THEN** the listing retains stable identity and coherent ordering as far as the source contract permits; duplicate display or silently invented start/end times are not acceptable.

### Requirement: Bounded and usable operation
- **WHEN** a visitor requests another page **THEN** only a bounded amount of work is performed; the site SHALL remain usable for a large set of upstream outfalls.
- **WHEN** the source cannot serve further history **THEN** the UI SHALL clearly indicate exhaustion or an evidence/producer limitation, rather than show a broken infinite spinner.
- Public pages SHALL NOT expose private RDP authentication or infer a complete historical record from only a partial producer response.

## Non-goals
Rebuilding the existing map, a generic RDP CSO dashboard, annual discharge statistics unsupported by evidence, rewriting provider identity, or changing the HPP water-quality indication/alerts.
