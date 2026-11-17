# Capability: Consistent isHPPOpen website presentation

## ADDED Requirements

### Requirement: Navigable public pages
The homepage, water-quality, historical levels/events, forecast, Trent and alerts experiences SHALL feel like parts of one site.

#### Scenario: Moving between major areas
- **WHEN** a visitor opens a major public page **THEN** they can identify where they are and reach other major areas without relying on browser history or inconsistent one-off back links.

#### Scenario: Narrow screens
- **WHEN** a visitor uses a small screen **THEN** navigation, content and interactive controls remain readable and operable without obscuring essential map/chart information.

### Requirement: Coherent interface conventions
- **WHEN** visitors encounter headings, panels, links, forms and status states across pages **THEN** shared conventions create a recognisable visual hierarchy, while allowing specialist maps, charts and history controls to suit their content.
- **WHEN** data are loading, empty, stale or unavailable **THEN** the visual states communicate the distinction consistently and SHALL NOT invent numeric readings or confident conclusions.

### Requirement: Information-first language
- **WHEN** a page presents river conditions or water-quality evidence **THEN** prominent text SHALL convey the actual information, meaning and next useful action rather than repeatedly justify the implementation.
- **WHEN** methodology, attribution or safety/uncertainty context materially affects interpretation **THEN** the information SHALL remain accessible in an appropriate location, not be deleted just to reduce word count.
- Copy SHALL be plain English, concise and respectful; it SHALL NOT imply that indicative river or CSO information establishes personal water safety.

## Non-goals
Replacing the frontend framework, identical layouts for unlike views, suppressing relevant caveats, redesigning every chart, or altering RDP/HPP decision logic as a styling side effect.
