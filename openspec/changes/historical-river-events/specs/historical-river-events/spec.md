# Historical high-water events — product requirements

## ADDED Requirements

### Requirement: Visitors can discover significant observed high-water periods
isHPPOpen SHALL let visitors find and open past Colwick high-water periods identified from eligible historic level observations. The list and detail SHALL identify the measure, reference threshold, observed timeframe and evidence quality. The initial threshold is the existing **2.2 m** Colwick HPP level reference.

#### Scenario: Well-supported event
- **WHEN** an interval's qualified Colwick observations support a rise above the reference, an observed peak, and a return below it
- **THEN** the visitor can find that event and inspect its time window, measured maximum and supported threshold-exceedance duration with a linked hydrograph.

#### Scenario: Historical search period
- **WHEN** a visitor selects a year or a specific historical month
- **THEN** the list is scoped accordingly and makes events overlapping a selected period discoverable without falsely cutting off an event at a calendar boundary.

### Requirement: Event boundaries and durations reflect evidence, not interpolation
An event SHALL NOT claim an exact start, end, peak or continuous duration where recorded observations and their quality/coverage do not support it. Unknown periods and unavailable pages SHALL be distinguished from known below-threshold periods.

#### Scenario: Missing readings near a crossing
- **WHEN** the first at/above-threshold reading follows an unverified observation gap
- **THEN** the true onset is shown as uncertain or bounded by evidence; it is not presented as an exact crossing instant.

#### Scenario: Unresolved gap during the event
- **WHEN** readings are missing between two high measurements
- **THEN** the product discloses the unknown interval and does not silently count it as continuously high, combine episodes without qualification, or claim a precise duration through it.

#### Scenario: Event starts before or ends after requested period
- **WHEN** an event is only partly within the chosen query window or the supplied archive is incomplete
- **THEN** partial status is made visible and a year boundary alone is not claimed as the event start/end.

### Requirement: Events remain observations, not site decisions or public warnings
Every historic event SHALL be described as a reconstruction of **river-level evidence**, distinct from operational HPP transitions, course opening, issued flood warnings and real-time forecasts.

#### Scenario: Threshold exceeded but operational status differs
- **WHEN** the historic level exceeded 2.2 m during an independently recorded HPP status period
- **THEN** the event view does not rewrite `openIndicator`, mislabel the event as a confirmed course closure, or generate a retrospective notification.

### Requirement: Historical data revisions do not create false certainty
The event experience SHALL remain traceable to measurement, time window and returned provider quality/revision evidence. Events may be recalculated when valid historical observations are corrected; a prior event ordering or peak is not an immutable historical fact without independent evidence.

#### Scenario: Revised observed peak
- **WHEN** the upstream canonical history is corrected and a peak value changes
- **THEN** the event display can reflect the revised evidence with attributable source context, without modifying authoritative HPP decisions or concealing previous uncertainty.

### Requirement: Later multi-gauge comparison respects measurement meaning
If multi-gauge comparison is offered, it SHALL use only separately verified, available historical series and distinguish station locations, units/parameters and independent datums. A derived time offset is descriptive of the selected historical event, not automatically a forecast.

#### Scenario: One comparator is missing or unverified
- **WHEN** a selected related station lacks approved historical data or its measure equivalence is unresolved
- **THEN** that comparator is unavailable/limited with an explanation; no substitute gauge or fake aligned series is displayed.

#### Scenario: Two stations show different absolute levels
- **WHEN** historical event curves from different station datums appear together
- **THEN** the chart labels their independent measurement meaning or uses an appropriate normalised view, never suggesting equal absolute mASD readings mean equal depth or severity.
