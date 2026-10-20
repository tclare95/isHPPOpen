# Tasks: Six-series gauge parity and reusable catalogue (#52)

Documentation-only tasks for later implementation; none are complete yet.

## A. Complete RDP's existing gauge coverage
- [ ] 1.1 Verify exact EA source measurement IDs, observation parameters, units/datums, reporting periods and source watercourses for Clifton Bridge 4126, Church Wilne 4067 and Kegworth 4074; capture attributed metadata fixtures, rejecting ambiguous multiple-measure stations.
- [ ] 1.2 Add stable canonical IDs `ea-clifton-bridge-level`, `ea-church-wilne-level`, `ea-kegworth-level` after validation; preserve three already registered series and Shardlow level/flow independence.
- [ ] 1.3 Validate complete six-series parity through RDP catalogue, latest, chronological history and per-measurement health with fixtures; no invented live data.

## B. Configuration and publication boundaries
- [ ] 2.1 Make registration, collection selection and internal API publication explicit and independently validated, with safe default-deny behaviour. Keep stable provider/station/external-measure identity.
- [ ] 2.2 Preserve stage 1–3 explicit-measurement allowlist, disabled schedules and stage/prod isolation. No implicit production collector expansion on catalogue merges; retain conservative catalogue operational bounds.
- [ ] 2.3 Prove an additional **supported** EA measure can be registered and published in fixtures by reviewed configuration alone, without modifying station-specific ingestion/query code or activating a collector.
- [ ] 2.4 Test invalid/duplicate upstream IDs, mismatched units/datum/reporting period, unknown/disabled/unpublished series and independent neighbour failures.
- [ ] 2.5 Run RDP .NET restore/build/test/format and SAM template checks; separately approved optional small stage smoke under #75, without AWS apply on PR merge.

## C. Consumer-facing handoff
- [ ] 3.1 Keep isHPPOpen's curated six-series display groups, names, chart selection and alert eligibility as web-only config, with explicit canonical aliases owned by #51.
- [ ] 3.2 Contract-test that RDP catalogue remains usable without an isHPPOpen configuration entry and that adding a web display uses explicit reviewed selection.
- [ ] 3.3 Record onboarding checklist: metadata verification, registry validation, publication/operational-selection distinction, small stage approval, production activation review and web selection if desired. Link implementation PR/evidence to #52.

## Non-goals
No playground UI (#77), external public API (#78), new provider, unsupported sensor types, dynamic admin UI, auto-poll-everything or production activation.
