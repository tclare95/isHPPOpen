# Web UI lifecycle

## Purpose
Keep charts, admin event selection and scheduled banners current without copying
derived UI data into effect-managed state or reading the clock during rendering.

## ADDED Requirements
### Requirement: Chart input updates
The system SHALL preserve chart columns, chronological sorting, threshold bounds,
confidence controls and empty-state behavior when chart inputs change.

#### Scenario: Input changes or disappears
- **WHEN** measurement, forecast, accuracy, stability or threshold inputs change
- **THEN** the chart reflects the latest rows and controls, without retaining removed rows.

### Requirement: Annotation clock samples
The system SHALL resample the chart “Now” annotation when transformation inputs
change and SHALL keep that sample stable across unrelated renders.

#### Scenario: Clock advances without a chart input update
- **WHEN** time advances but the chart's inputs retain the same identity and values
- **THEN** the annotation keeps its prior sample until an input changes.

### Requirement: Valid event selection
The system SHALL retain a valid selected event across refreshes and SHALL replace
a removed selection with the first remaining event or new-event mode for an empty list.

#### Scenario: Selected event disappears
- **WHEN** a refresh removes the selected event
- **THEN** the editor selects the first remaining event, or new-event mode if none remain.

#### Scenario: New event is explicitly selected
- **WHEN** the operator chooses new-event mode and the list refreshes
- **THEN** the editor remains in new-event mode.

### Requirement: Scheduled banner visibility
The system SHALL evaluate scheduled banners at the viewing time after hydration,
at schedule boundaries and when the browser regains focus, without hydration mismatches.
Start and end timestamps SHALL be inclusive. Unscheduled banners SHALL remain
eligible for server rendering.

#### Scenario: Schedule boundary passes
- **WHEN** the start timestamp arrives or the end timestamp has passed
- **THEN** the banner appears or disappears without requiring another page render.

#### Scenario: Cached markup hydrates at another time
- **WHEN** scheduled banner markup is served after its server render time
- **THEN** initial hydration matches the markup and client visibility uses the viewing time.

#### Scenario: Schedule changes or the component unmounts
- **WHEN** schedule props change or the banner component unmounts
- **THEN** obsolete schedule timers and focus subscriptions are cleared.
