# Legacy forecast compatibility — product requirements

## ADDED Requirements

### Requirement: Maintain the public combined river snapshot
Before retiring the Node publisher, an authorised successor SHALL preserve the externally consumed public `levels/latest.json` key and the existing dated `levels/year=YYYY/month=MM/levels-*.json` publication behaviour unless a separately reviewed consumer migration changes those contracts.

#### Scenario: Normal publication
- **WHEN** verified levels and government forecast data are available
- **THEN** the compatibility snapshot exposes `model_date`, `level_readings` with `reading_date`/`reading_level`, `forecast_readings` with `forecast_date`/`forecast_reading`, and `level_source`, retaining current types, ordering, metre units and UTC interpretation.

#### Scenario: Partial forecast availability
- **WHEN** observations are available but government forecast values are not
- **THEN** the snapshot retains observations and reports the forecast portion as an empty array, rather than inventing a forecast or replacing it with predictor output.

#### Scenario: No eligible observed levels
- **WHEN** the selected observation source fails and only a last-known fallback is available
- **THEN** any compatibility publication preserves explicit fallback provenance and does not misrepresent cached observations as fresh; if there is no usable level series, the publisher does not fabricate a replacement snapshot.

### Requirement: Keep website contract compatibility
The website SHALL preserve `/api/levels`'s `level_data`, `forecast_data` and health envelope and the separate ML-facing `/api/s3forecast`, accuracy/stability routes and forecast alert behaviour until their own reviewed cutovers.

#### Scenario: Levels source switches to RDP
- **WHEN** `/api/levels.level_data` is sourced from RDP as provided by [#51](https://github.com/tclare95/isHPPOpen/issues/51)
- **THEN** `forecast_data` remains independently supplied and its failure/health cannot falsely mark observed levels as healthy or vice versa.

### Requirement: Prevent competing publishers and unsafe cutover
Only one authoritative writer SHALL own each live public object key at a time, with observable publication freshness and independently approved activation/rollback.

#### Scenario: Shadow publication
- **WHEN** the successor generates parity data
- **THEN** it writes no live public key and does not alter legacy Node/Mongo outputs, forecast alerts or production reader settings.

#### Scenario: Authority transfer or rollback
- **WHEN** ownership of `levels/latest.json` changes or reverts
- **THEN** old/new writers cannot race to overwrite it; the object remains compatible and a stale/failed successor does not overwrite it with fabricated success.
