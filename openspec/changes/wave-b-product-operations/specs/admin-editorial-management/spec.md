# Capability: Reliable editorial event management

## ADDED Requirements

### Requirement: Browse all editorial events
Administrators SHALL be able to find and manage existing past, present and future events, while the public upcoming-events presentation remains unchanged.

#### Scenario: Historical and future lookup
- **WHEN** an administrator opens event management **THEN** they can locate previous and future events using appropriate browsing, filtering or paging without being limited to the current public upcoming-events result or a hardcoded first batch.
- **WHEN** an event is selected **THEN** its saved identity, dates and content are correctly represented in the edit form.

### Requirement: Preserve event identity and avoid accidental overwrite
- **WHEN** an administrator creates a new event **THEN** an existing event with the same name is not silently updated.
- **WHEN** an administrator edits an event **THEN** the target is identified by its stable saved identity, and a missing/invalid identity does not create an unintended duplicate.
- **WHEN** dates or required content are invalid **THEN** the edit is rejected with useful feedback while existing data remain intact.

### Requirement: Reliable editorial operations
- **WHEN** an authorized event change succeeds **THEN** the administrator receives an accurate result and the public/event homepage cache reflects the edit under the existing cache strategy.
- **WHEN** a write fails or access is denied **THEN** the editor retains the user's input as practical, does not claim success and reveals no protected record to an unauthorized caller.
- **WHEN** an administrator edits the existing homepage banner **THEN** the current scheduling, draft preservation and visibility behaviour remain available.

## Non-goals
New CMS, data migration, editorial approval workflows, changing public event URLs or making past events appear in the default homepage feed.
