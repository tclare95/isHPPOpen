# Tasks: Investigate storage and data model

## 1. Document today's contracts and volumes

- [x] 1.1 Inventory scraper Mongo collections, S3 latest/history/archive objects and predictor outputs with collection purpose, consumer, writer, retention and region; reconcile with `docs/CONTRACTS.md`.
- [ ] 1.2 Obtain approved read-only data/index size, row counts, date ranges, schema samples without personal data and data growth estimates. Explicitly document unavailable metrics rather than guessing.
- [x] 1.3 Capture actual common queries, expected response windows and failure modes for HPP status, level/flow dashboards, alerts, CSO snapshots, forecasting inputs and history.

## 2. Create backend-neutral target contract

- [x] 2.1 Define stable source, station, measurement and observation identities and units; ensure two measure types at the same station/timestamp never overwrite each other. Specify UTC, observed vs ingested time, correction/dedup semantics and provenance.
- [x] 2.2 Define distinct handling of HPP events, CSO intervals, forecasts and alerts. **Owner decisions:** DynamoDB 365 rolling days full-resolution, canonical raw gauge S3 archive indefinitely, phased observation-first migration keeping Mongo temporarily. Historical >365d *access SLA* remains a validation item, not an undecided retention policy.

## 3. Compare candidate architectures

- [ ] 3.1 Estimate 1/3/5-year capacity, index overhead and region-specific running costs for present usage and 25/100/500 measurements under at least two retention profiles.
- [ ] 3.2 Validate representative ingest, latest, 24h/7d/year-history, alert and bounded comparison queries for MongoDB+S3, PostgreSQL+S3 and DynamoDB+S3; benchmark safely against fixtures or approved isolated data.
- [ ] 3.3 Evaluate permissions, backups, durability, observability, preview isolation, cross-region access, operating burden and migration/rollback feasibility for each choice.

## 4. Decide, document and hand off

- [x] 4.1 Produce an ADR with evidence, dated cost assumptions, preferred option and rejected alternatives (or explicitly document any blocking evidence gap). Review it before recording storage as decided.
- [x] 4.2 Draft safe producer/consumer cutover, parity checks, history reconstruction limits, failure recovery and rollback plan. Cross-link future issues [#49](https://github.com/tclare95/isHPPOpen/issues/49), [#50](https://github.com/tclare95/isHPPOpen/issues/50), [#51](https://github.com/tclare95/isHPPOpen/issues/51).
- [ ] 4.3 Review investigation output in a documentation PR. No production writes, archive deletions, secret changes, infrastructure deployment or model publication.

This investigation intentionally has `skip_specs: true`. Do not invent a behavioural capability spec or implement the selected backend as part of this change.

## Investigation outcome (8 October 2026)

Source-code audit, target identity/schema, workload estimates, retention policy and migration/rollback approach are documented in [ADR-001](../../../docs/decisions/0001-observation-storage.md) and [draft PR #62](https://github.com/tclare95/isHPPOpen/pull/62).

**Owner-confirmed (8 October 2026):**
- Store **365 rolling days of full-resolution gauge observations in DynamoDB**.
- Preserve **canonical raw gauge observations indefinitely in S3**, with no expiry lifecycle; cost/verify archive recovery and version retention.
- **Migrate observations first**; keep Mongo for HPP transitions, CSO, editorial and alerts until each separate domain is assessed/migrated.

**Architecture choice remains proposed, not finally approved.** Open gates: 1.2 (approved live inventory and measured counts/bytes/indexes), 3.1 (current eu-west-1 pricing and perpetual S3 growth / read costs), 3.2 (isolated candidate and fallback benchmark with 365-day queries, monthly partitions, archive recovery and TTL safety), 3.3 (IAM, Vercel region/preview isolation, backups, restore, rollback, operational burden) and 4.3 (PR review). Also confirm user-facing access/latency for **raw data older than 365 days**: indefinite retention does not automatically imply synchronous chart queries.

No production inventory, database write/delete, infrastructure deployment or retention change was performed.
