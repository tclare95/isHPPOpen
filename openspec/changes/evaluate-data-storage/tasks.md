# Tasks: Evaluate data model, storage and retention (#48)

OpenSpec investigation: `skip_specs: true`. Architecture decision and source-code review only; no application changes, live-data access, deployment or migration.

## 1. Existing source contracts and sizing

- [x] 1.1 Inventory Mongo collections and readers/writers, S3 latest/history/CSO archives and predictor output contracts from the five affected repositories. Retain source/consumer references in ADR-001.
- [x] 1.2 Record sizing evidence **and limitations**: owner confirms production Atlas **Free** tier; published quota is **512 MB**, but actual collection/index counts and S3 versions/bytes were **not read**. The bounded Mongo/S3 inventory needed for backfill parity is now a #50 *implementation* step, not a precondition to selecting a database.
- [x] 1.3 Document existing HPP, gauge, CSO, forecast and alert access patterns, fallback and freshness contracts.

## 2. Observation model and retention

- [x] 2.1 Specify stable provider/station/**measurement** IDs and `measurementId + observedAt UTC` observation identity. Distinguish level/flow, units, source datum, observed/ingested time, corrections, provenance and idempotency.
- [x] 2.2 Keep HPP transition events, CSO snapshots/incidents, forecast run/target data, alerts and editorial state distinct. Agree **365 rolling days of full-resolution DynamoDB** and **indefinite raw gauge-observation S3 Standard**.
- [x] 2.3 Accept direct `S3 GetObject` historical reads (partitioned month/day objects + manifest), with modest latency and no separate query/analytics service.

## 3. Architecture trade-offs and proportionate evidence

- [x] 3.1 Model 25/100/500 measurements, 1/3/5-year observation counts and 5/10/20-year perpetual-archive storage. Provide dated illustrative Dynamo request/storage rates, clearly separating them from **unverified** eu-west-1 cost estimates. Detailed billing and budgets belong to implementation deployment checks.
- [x] 3.2 Compare source-compatible Mongo+S3, PostgreSQL+S3 and DynamoDB+S3 to known query shapes. **No separate staging infrastructure prototype or historical p95 benchmark** is required for this architecture decision; practical 365-day query, correction, S3 reads and archive tests belong to #49/#50/#51.
- [x] 3.3 Define necessary IAM/preview boundaries, backups, monitoring, archival verification and reversible cutover. Implementation checks and production approval remain in linked follow-ons.

## 4. Decision and implementation handoff

- [x] 4.1 Record the **Accepted architecture** in [ADR-001](../../../docs/decisions/0001-observation-storage.md): DynamoDB + S3 Standard for canonical gauge observations; keep Mongo for other domains during observation-first migration.
- [x] 4.2 Document additive writer, archive/backfill, shadow reader, rollback and expiry-after-verification order. Cross-link [#49](https://github.com/tclare95/isHPPOpen/issues/49), [#50](https://github.com/tclare95/isHPPOpen/issues/50), [#51](https://github.com/tclare95/isHPPOpen/issues/51).
- [x] 4.3 Place investigation and decisions in a documentation PR for review ([#62](https://github.com/tclare95/isHPPOpen/pull/62)); issue #48 can be closed after the documentation PR merges. This does not authorise production data access or infrastructure changes.

## Deliberately deferred to implementation, not missing investigation evidence

- **#49:** Ingest identity, duplicate/correction and latest pointer tests, IAM and first-deploy bounded read/write/billing sanity checks.
- **#50:** Bounded read-only Mongo/S3 source inventory and historical parity before backfill; S3 archive content checksums/manifests, direct old-history GET, replay, no archive expiry and Dynamo TTL only after verification.
- **#51:** Raw 365-day bounded Dynamo reads, direct historical S3 GET, API pagination, fallback, older-data performance tolerance, Vercel preview isolation and reversible cutover.
- **Deployment:** Apply current eu-west-1 prices and cost alarms, verify S3 and Dynamo access/backup settings, inspect original data only with appropriate authorised access. Do not claim historical samples exist if upstream/S3/Mongo cannot reconstruct them.

**No live measurements or benchmark were performed in this investigation.** The design is accepted based on the user's risk/performance preferences and the verified small Atlas Free tier, not on invented live volumes.
