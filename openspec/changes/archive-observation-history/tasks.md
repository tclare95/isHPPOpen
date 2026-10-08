# Tasks: Permanent observation archive

## 1. Raw format and S3 layout

- [ ] 1.1 Define versioned canonical row JSONL schema and deterministic provider/measurement/month/chunk keys; validate UTC, unit, quality, provenance and corrected values. Provide representative EA fixture, including Shardlow level+flow.
- [ ] 1.2 Implement narrow S3 `IObservationArchive` adapter in new .NET service with immutable chunks and committed manifest (key/version/count/min/max/checksum/schema revision), encryption and private IAM.
- [ ] 1.3 Implement deterministic replay and month compaction/late correction policies with manifest generation/version concurrency safety; avoid duplicate overlapping snapshot history.

## 2. Durability and hot retention

- [ ] 2.1 Integrate `archive write -> integrity verification + manifest commit -> Dynamo hot write/latest update -> durable cursor`. Define recoverable states for partial failures and do not report hot ingestion success on an S3-only commit.
- [ ] 2.2 Implement 365-day TTL eligibility **only after** verifying archive coverage; verify no expiration on S3 canonical archives/manifests, no premature deletion from older backfill and predictable logical expiry filtering.
- [ ] 2.3 Implement operator diagnostics for missing archive, checksum mismatch, failed compaction, retry backlog and stale/latest measurement state without exposing secrets.

## 3. Direct S3 history reader

- [ ] 3.1 Implement measurement+UTC-range manifest resolution and bounded private `GetObject` streaming, decompression, correction resolution, chronological ordering and pagination.
- [ ] 3.2 Test older-than-year queries, multiple month boundaries, missing/partial partitions, corrupted files and archive versions; document response/incomplete-history semantics for #51.

## 4. Verification and rollout

- [ ] 4.1 Unit/test S3 adapter and failure matrix: S3 upload failure, manifest race, Dynamo write failure after S3 success, retry/replay, correction, late backfill and interrupted compaction; build/test/lint/SAM validate as relevant.
- [ ] 4.2 Provide staging-only, manually approved integration checks and rollback plan; **do not** enable prod TTL, prune legacy Mongo/S3, import old data or switch web reads in this change.
- [ ] 4.3 Link implementer evidence in [#65](https://github.com/tclare95/isHPPOpen/issues/65) and hand off historical reconstruction to [#50](https://github.com/tclare95/isHPPOpen/issues/50) and web readers to [#51](https://github.com/tclare95/isHPPOpen/issues/51).

This is a cross-repository plan: canonical OpenSpec lives in isHPPOpen; new .NET backend owns tests/code/release. A reviewed documentation PR is not deployment approval.
