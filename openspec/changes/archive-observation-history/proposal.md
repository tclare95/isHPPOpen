# Proposal: Permanent gauge-observation archive

## Why

The chosen observation store retains 365 days of full-resolution readings in DynamoDB and canonical raw data indefinitely in S3 Standard. The existing scraper stores overlapping multi-day snapshots, and a new per-measurement system must avoid that repeated-data model without risking deletion before archival.

## What changes

- Build an independently testable **S3 archival adapter** inside the **observation domain of** `river-data-platform`, not the legacy Node.js Lambdas or CSO event storage.
- Persist source-observed measurements in compact date-partitioned, versioned, private S3 Standard objects with a manifest defining count, time range, checksum, schema/version and correction handling.
- Support **direct GetObject** retrieval of relevant partitions for historic range requests, including data older than the 365-day DynamoDB window; accept modest latency but bound reads and responses.
- Retain canonical raw archives indefinitely and enable DynamoDB 365-day TTL **only after independently verified permanent archive coverage**.
- Exercise retries, corrections, crashes, replay and missing partitions in tests.

## Capabilities

### New capabilities
- `observation-archive`: durable, verifiable, permanently retrievable canonical observations, with safe hot-retention eligibility.

## Impact / Dependencies

**Code owner:** new `tclare95/river-data-platform` repository. **Central plan:** `tclare95/isHPPOpen` OpenSpec. Tracking [#65](https://github.com/tclare95/isHPPOpen/issues/65), prerequisites [#64](https://github.com/tclare95/isHPPOpen/issues/64) and [#49](https://github.com/tclare95/isHPPOpen/issues/49). Matches [ADR-001](../../../docs/decisions/0001-observation-storage.md).

## Non-goals

Full historical backfill from Mongo/legacy S3 ([#50](https://github.com/tclare95/isHPPOpen/issues/50)), migrating web consumers ([#51](https://github.com/tclare95/isHPPOpen/issues/51)), a new archive administration UI, Athena/Glue/S3 Select, an asynchronous exports subsystem, CSO retention/archival redesign, modifying existing production Lambdas or changing old S3 keys.

## Release / rollback

Archive-only writes and reads can be staged independently while legacy producer output remains unchanged. Production TTL and any migration require separate explicit approval. Disable new collection or archive reads on failure; do not expire or delete any old data until archive coverage is known to be safe.

## Low-footprint stage requirement

The archive must be testable using small verified S3 objects, Dynamo on-demand, an injected clock and synthetic historical partitions in the **isolated, normally idle integration stage** defined by [#75](https://github.com/tclare95/isHPPOpen/issues/75). Do not provision or backfill a production-sized staging S3 archive. The **canonical indefinite S3 Standard retention** and 365-day hot expiry rules remain identical in domain logic, including staging tests; separately approved cleanup of tagged **disposable staging fixtures** is an environment operation, not a shorter archive retention policy. The first real EA collector smoke runs only after archive-before-Dynamo safety is implemented.
