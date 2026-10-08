# Tasks: Configurable gauge ingestion

## 1. Contracts and source configuration (backend-neutral)

- [ ] 1.1 Define an EA-only initial registry format and schema validation in the scraper repository; include unique source/station/measurement identity, unit/parameter and source-owned identifiers. Document examples for Colwick and both Shardlow level/flow without enabling new production collection.
- [ ] 1.2 Define and test normalised observation contract, UTC timestamps, provenance, duplicate/correction policy and provider-adapter errors; keep status transitions, CSO events and forecast records outside the scalar observation type.
- [ ] 1.3 Implement fixture-driven EA adapter and version-controlled registry tests with bounded rates/timeouts; verify a configured new measure requires no custom per-station handler.

## 2. Storage decision gate

- [ ] 2.1 Verify the [storage evaluation](../evaluate-data-storage/proposal.md) outcome is reviewed and its observation identity, retention and write/read access contracts are stable. **Do not implement a production persistence adapter until this is decided.**
- [ ] 2.2 Implement persistence through the selected store only after gate 2.1, with per-measurement uniqueness, bounded overlap, corrections/replays and no advancing watermarks before successful writes. Test collisions for same station/time with different measures.

## 3. Collection orchestration and diagnostics

- [ ] 3.1 Introduce bounded per-measurement orchestration, independent errors, retry and incremental collection; test timeout, 429, no new readings and partial failure.
- [ ] 3.2 Record per-measurement last run and last observation timestamp, lag, outcome and counts; add safe operator diagnostics/alarms consistent with chosen infrastructure. Verify freshness is not inferred from HTTP success.

## 4. Shadow rollout and verification

- [ ] 4.1 Compare a limited shadow ingestion run with the existing EA and scraper data without changing consumer responses or existing Mongo/S3 contracts. Record explicit replay and parity evidence.
- [ ] 4.2 Pass backend tests, syntax/SAM/CI checks and verify no inadvertent new consumer cutover, archived data deletion or predictor change. Link backend PR and evidence in [#49](https://github.com/tclare95/isHPPOpen/issues/49).
- [ ] 4.3 Document the **separate** work needed for historical backfill [#50](https://github.com/tclare95/isHPPOpen/issues/50), web consumers [#51](https://github.com/tclare95/isHPPOpen/issues/51) and broader gauge onboarding [#52](https://github.com/tclare95/isHPPOpen/issues/52). Do not complete those changes here.

This is a coordinated cross-repo OpenSpec change: the central specification is in isHPPOpen; the scraper owns code and manual AWS releases. No production deployment is authorized by this document.
