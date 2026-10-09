# Design: Raw observation archive in the .NET collector

## Contract and object layout

Implement `IObservationArchive` with bounded `WriteBatchAsync`, `VerifyCoverageAsync` and `ReadRangeAsync` semantics. Canonical archive rows contain schema version, source/provider ID, measurement ID, upstream observed UTC time, value, original unit/datum, quality, collected UTC time, upstream source revision/provenance and optional correction lineage. Preserve actual source values, not an invented interpolated 15-minute series.

**Object layout:** private S3 Standard bucket with keys such as `observations/v1/provider={id}/measurement={id}/year={yyyy}/month={MM}/chunk={runid}.jsonl.gz`; IDs must be path-safe and collision-proof. Use immutable chunks for active months, then compact into one or a few immutable canonical monthly objects per measurement when complete. No per-minute or giant all-time objects. A small schema-versioned manifest for the same measurement/month identifies the committed object versions, covered timestamps, count/checksum, source revision watermark, status and generation. Readers follow the latest **committed** manifest rather than listing the whole bucket. Manifest update is conditional/version-aware to prevent two writers silently losing a chunk/correction; recover retries with deterministic batch IDs. When corrections arrive after a month is compacted, publish a new manifest generation referencing a new canonical object/version (or a bounded immutable correction segment), preserving previous provenance. Never mutate an archived value in place without auditable lineage.

**Stage-2 ingestion dependency:** EA collection (#49) produces normalised observations and an idempotent write intent. Stage-3 archive makes the durable path authoritative. For each eligible batch, write S3 immutable payload, verify/checksum and commit the manifest, then perform Dynamo hot writes/latest-pointer updates. If S3 commit fails, mark the measurement failed and do not mark affected observations eligible to expire or advance its durable ingestion cursor. If S3 succeeds but Dynamo fails, retain the manifest and replay Dynamo with the same deterministic IDs; an S3 archive alone is not considered a successful *hot* ingestion run.

## 365-day hot retention

Dynamo observation identity is `measurementId#YYYY-MM` + UTC observedAt. To avoid expiring a newly arrived correction/backfill before archival, assign TTL only after manifest-backed archive verification, calculated using observedAt + 365 days. Dynamo TTL is eventual; API filtering must use observedAt rather than assume immediate deletion. For a late record older than the hot window, **archive it**, verify it, but do not require it to remain queryable in hot Dynamo. If an unverified partition or archived correction is detected, block expiry and surface a health signal. **Never set expiration lifecycle on canonical raw archive objects/manifests.** Retain versions needed for replay/correction history (indefinite policy applies to canonical raw history and necessary integrity/provenance records, not disposable temp uploads).

## Historical reads

A caller supplies measurement ID and bounded inclusive/exclusive UTC time window. Resolve only the necessary manifest/month objects, `GetObject` each, stream/decompress/read and filter to the window, resolve authoritative corrections, sort ascending and paginate/limit response. Range size and maximum bytes/rows are server-controlled. Missing partition returns explicit incomplete-history metadata, not fabricated zeroes, a success with silent holes or a fallback to scanning all S3. Private bucket; use narrow server credentials/roles, not public S3 lists. A consumer-facing Next.js API is a separate #51 concern; this change proves the backend library path and contracts.

## CI and failure cases

Unit/fixture tests and mocked S3 requests prove manifest checksum/count/time-window integrity; idempotent repeated run, same-time source correction, late backfill, two concurrent archive writers, mid-write process death, S3 success with Dynamo failure, UTC month boundary, corrupted/missing manifest and direct `GetObject` results. One optional non-production storage integration check can be part of the normal implementation release, **not** a separate feasibility prototype. Cost/bucket alarms are deployed when infrastructure is separately authorised.

## Follow-on responsibilities

[#50](https://github.com/tclare95/isHPPOpen/issues/50) imports historical Mongo and legacy S3 snapshots with dedup/coverage reports; [#51](https://github.com/tclare95/isHPPOpen/issues/51) wires the web year-history and older-than-year API to new Dynamo/S3 readers. Old HPP status, CSO, forecast and alert stores are unchanged.

## Lightweight stage verification, not a full history replica

Stage verification uses a handful of stage-only immutable S3 objects and manifests, one or more synthetic date partitions beyond 365 days and an injected clock/controlled Dynamo fixture. Test archive-first durability, corrections, replay, reader rollover and source coverage; do **not** create a year of real staging polling or duplicate legacy archives. Stage provider selection remains 1–3 explicit EA measures by default with a manually triggered bounded run after #49+#65. Stage/prod may use the same approved AWS account but require separate writable resources and IAM. Environment-managed disposal of explicitly labelled stage test fixtures (after approval and recorded integrity checks) must be kept separate from the canonical indefinite archive/TTL logic. See [#75](https://github.com/tclare95/isHPPOpen/issues/75).
