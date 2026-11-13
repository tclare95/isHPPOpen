# Capability: RDP-backed HPP CSO consumer

## Requirements

### R1. Existing behaviour and separation
- **WHEN** the RDP CSO consumer is disabled or in shadow **THEN** the existing public water-quality routes, markers, current/6/24/48h filters, density chart, calibrated indication and alert/delivery state retain their legacy authority and shapes.
- **WHEN** the RDP River Tracer overlay is unavailable **THEN** the existing map and CSO status/indicator continue independently.
- **WHEN** an RDP observation/event is not for an approved HPP member **THEN** it does not silently expand the legacy status-count population or enable RDP provider polling.

### R2. Read-only shadow and first-party access
- **WHEN** comparing an HPP outfall **THEN** the server uses the existing first-party authenticated RDP client pattern and provider canonical IDs; browser clients never receive RDP credentials/private endpoints.
- **WHEN** RDP is slow, returns an error or has a coverage gap **THEN** diagnostics report the failure without altering legacy public results, writes or alerts; requests remain bounded/cached and avoid stampedes.
- **WHEN** values differ **THEN** diagnostics show the compared timestamps, source/fetch ages, selection/mapping version, status/error and relevant coverage; they are not proof that either source is correct.

### R3. Status semantics
- **WHEN** RDP reports `effectiveState = unknown`, stale, offline, unselected, missing, unresolved or unavailable **THEN** consumers do not display a confident `not_spilling`/zero inferred from that state.
- **WHEN** a provider says stopped without an evidenced event end **THEN** no exact end time is invented. Current status and event lifecycle remain distinct; support an ongoing/carry-in event and corrected boundary.
- **WHEN** RDP source timestamps differ from legacy `DateScraped` or `scrape_timestamp` **THEN** preserve the difference, do not treat fetch time as provider freshness.

### R4. Event history and interpretation
- **WHEN** requesting a time range **THEN** the consumer respects bounded windows/pages/cursors, hot+archived history, overlapping ongoing events, corrected revisions and duplicate stable IDs.
- **WHEN** coverage is partial/unknown or a source only exposes latest-event slots **THEN** a lack of events never becomes a proven spill-free period or complete rate.
- **WHEN** official historical EDM events are imported **THEN** show source/attribution and note that annual 12/24 counted spills differ from event activations; imported records must not affect live current status or alert history.
- **WHEN** an archive integrity failure occurs **THEN** surface unavailable history, not an empty chart or fabricated zero.

### R5. Calibrated activity protection
- **WHEN** optional event-derived activity is displayed **THEN** label it as a new evidence/coverage-aware series, not the legacy `number_CSOs_per_km2` or a safety measurement.
- **WHEN** the site density calculation, selected upstream identities, 48h activity predicate, raster co-location counting or drainage-area denominator changes **THEN** do not reuse historical 0.0105/0.0258 thresholds or email transition semantics without explicit time-aligned parity or versioned recalibration approval.
- **WHEN** live metric data are missing/stale **THEN** keep `unavailable` distinct from true zero; preserve older historical values with source/version attribution.

### R6. Release gates
- **WHEN** the team proposes an RDP status/event source cutover **THEN** compare existing API/status/map behaviour and prove deployment health, source continuity, rollback and no second live event writer; obtain independent approval.
- **WHEN** membership/density or alerts are proposed for cutover **THEN** require separate approvals and compare history, thresholds, existing subscription state, rearm and delivery idempotency.
- **WHEN** retiring Node/SQS/Mongo writes **THEN** confirm remaining consumers, history/retention and exactly one authoritative writer for each persisted output; disable the mixed-duty Node schedule last.

### R7. RDP as the normal current-status source and legacy CSO collection retirement (#68)
- **WHEN** RDP is the selected current CSO source **THEN** the public water-quality status, counts, markers and per-outfall details are built from RDP evidence over the existing HPP membership, keep their existing shapes and source timestamps, and do not read the legacy per-outfall status snapshots.
- **WHEN** RDP is the selected source and no usable status can be read **THEN** the public result says current status is unavailable: no location is presented as spilling, recently stopped or clear, spill/recent counts are not reported as zero, and nothing falls back to a legacy snapshot that may no longer be updated.
- **WHEN** the legacy per-outfall status history is missing, empty or unreadable **THEN** optional comparisons that use it still present the remaining evidence and report the per-outfall comparison as unavailable; its absence is never a reason to keep legacy provider polling.
- **WHEN** water-quality alerts and operational health are evaluated **THEN** they use only the density and membership-summary freshness they already depend on, in every source mode, so retiring legacy CSO collection does not change their outcomes.
- **WHEN** the legacy CSO collection is retired **THEN** the legacy application makes no direct provider CSO status requests, writes no new per-outfall status records, and keeps existing records and archives; the mixed-duty Node schedule and its other outputs continue.
- **WHEN** a retirement step is rolled back **THEN** the previous source can be restored without replaying historical events or sending duplicate notifications.

## Non-goals
No new dashboard/map, platform risk engine, invented upstream matching, automatic polling selection, replacement 48h formula by convenience, publication of anonymous RDP reads, implementation or production changes from this spec.