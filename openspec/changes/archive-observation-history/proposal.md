# Proposal: Permanent gauge-observation archive

## Why

The chosen observation store retains 365 days of full-resolution readings in DynamoDB and canonical raw data indefinitely in S3 Standard. The existing scraper stores overlapping multi-day snapshots, and a new per-measurement system must avoid that repeated-data model without risking deletion before archival.

## What changes

- Build an independently testable **S3 archival adapter** inside the new `river-observations` .NET backend, not the legacy Node.js Lambdas.
- Persist source-observed measurements in compact date-partitioned, versioned, private S3 Standard objects with a manifest defining count, time range, checksum, schema/version and correction handling.
- Support **direct GetObject** retrieval of relevant partitions for historic range requests, including data older than the 365-day DynamoDB window; accept modest latency but bound reads and responses.
- Retain canonical raw archives indefinitely and enable DynamoDB 365-day TTL **only after independently verified permanent archive coverage**.
- Exercise retries, corrections, crashes, replay and missing partitions in tests.

## Capabilities

### New capabilities
- `observation-archive`: durable, verifiable, permanently retrievable canonical observations, with safe hot-retention eligibility.

## Impact / Dependencies

**Code owner:** new `tclare95/river-observations` repository. **Central plan:** `tclare95/isHPPOpen` OpenSpec. Tracking [#65](https://github.com/tclare95/isHPPOpen/issues/65), prerequisites [#64](https://github.com/tclare95/isHPPOpen/issues/64) and [#49](https://github.com/tclare95/isHPPOpen/issues/49). Matches [ADR-001](../../../docs/decisions/0001-observation-storage.md).

## Non-goals

Full historical backfill from Mongo/legacy S3 ([#50](https://github.com/tclare95/isHPPOpen/issues/50)), migrating web consumers ([#51](https://github.com/tclare95/isHPPOpen/issues/51)), a new archive administration UI, Athena/Glue/S3 Select, an asynchronous exports subsystem, CSO retention/archival redesign, modifying existing production Lambdas or changing old S3 keys.

## Release / rollback

Archive-only writes and reads can be staged independently while legacy producer output remains unchanged. Production TTL and any migration require separate explicit approval. Disable new collection or archive reads on failure; do not expire or delete any old data until archive coverage is known to be safe.
