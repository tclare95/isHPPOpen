# Tasks: Historical gauge reconstruction and protected backfill (#50)

Documentation-only planning; all implementation tasks remain unchecked.

## A. Inventory and dry-run normalisation
- [ ] 1.1 Add read-only, bounded inventory/extraction for legacy Mongo `riverschemas` and historical S3 snapshot objects/version evidence. Record accessible ranges/counts without deleting or editing sources.
- [ ] 1.2 Inspect supported EA historical data access for each registered measurement; explicitly resolve/deny government-page fallback station 2102 equivalence with Colwick 4009. Document source gaps and pragmatic stopping conditions.
- [ ] 1.3 Normalise individually observed UTC readings, numeric precision, verified parameter/unit/datum and evidence locator; deduplicate overlapping cached snapshots without treating `model_date` or `level_source` as individual fetch proof.
- [ ] 1.4 Implement deterministic candidate precedence, quarantine and conflict reports, immutable input/dry-run manifests and fixture tests for multiple snapshot copies, source corrections and unresolvable identity.
- [ ] 1.5 Review sample comparisons and per-measurement dry-run counts/time coverage; no canonical writes in this slice.

## B. Protected migration execution
- [ ] 2.1 Add a typed historical-import source evidence/validation path to RDP without forged EA URLs or invented original fetch timestamps; retain evidence references with audit provenance.
- [ ] 2.2 Add **atomic insert-if-absent** against canonical committed archive identity, including concurrent live writer races; never automatically supersede existing RDP observations. Require separate correction approval to alter them.
- [ ] 2.3 Reuse S3-first commit/verification and conditional hot-store repair for recent rows; archive-only outside 365d. Test partial S3/Dynamo failures, expiry and no collector cursor/health/latest regression.
- [ ] 2.4 Implement bounded time-partition import, dry-run vs execute switch, manifest-pinned checkpoints, idempotent resume and explicit resource/cost ceilings; no auto-scheduled task.
- [ ] 2.5 Record canonical/legacy parity, conflicting values, source-count reconciliation, observed-time coverage ranges and permanent known/unknown gaps for #69. Treat expected archive integrity failures separately.
- [ ] 2.6 Test replay/interruption, same timestamp different value, same station level/flow, concurrent collectors, old/new month windows, missing history and official EA source bounds.
- [ ] 2.7 Run backend format/build/tests/SAM checks; attach proof and instructions to issue #50. Any tiny stage or production import requires separately approved account/role/region/prepare/apply/invocation; **do not execute during implementation PR**.

## Explicit non-goals
No new historical database, destructive legacy cleanup, HPP event migration, all-year stage clone, automatic source corrections, consumer cutover or public API.
