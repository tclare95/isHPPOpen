# Tasks: Investigate storage and data model

## 1. Document today's contracts and volumes

- [ ] 1.1 Inventory scraper Mongo collections, S3 latest/history/archive objects and predictor outputs with collection purpose, consumer, writer, retention and region; reconcile with `docs/CONTRACTS.md`.
- [ ] 1.2 Obtain approved read-only data/index size, row counts, date ranges, schema samples without personal data and data growth estimates. Explicitly document unavailable metrics rather than guessing.
- [ ] 1.3 Capture actual common queries, expected response windows and failure modes for HPP status, level/flow dashboards, alerts, CSO snapshots, forecasting inputs and history.

## 2. Create backend-neutral target contract

- [ ] 2.1 Define stable source, station, measurement and observation identities and units; ensure two measure types at the same station/timestamp never overwrite each other. Specify UTC, observed vs ingested time, correction/dedup semantics and provenance.
- [ ] 2.2 Define distinct handling of HPP events, CSO intervals, forecasts and alerts. Decide requirements for raw S3 archives, active retention and historical access.

## 3. Compare candidate architectures

- [ ] 3.1 Estimate 1/3/5-year capacity, index overhead and region-specific running costs for present usage and 25/100/500 measurements under at least two retention profiles.
- [ ] 3.2 Validate representative ingest, latest, 24h/7d/year-history, alert and bounded comparison queries for MongoDB+S3, PostgreSQL+S3 and DynamoDB+S3; benchmark safely against fixtures or approved isolated data.
- [ ] 3.3 Evaluate permissions, backups, durability, observability, preview isolation, cross-region access, operating burden and migration/rollback feasibility for each choice.

## 4. Decide, document and hand off

- [ ] 4.1 Produce an ADR with evidence, dated cost assumptions, preferred option and rejected alternatives (or explicitly document any blocking evidence gap). Review it before recording storage as decided.
- [ ] 4.2 Draft safe producer/consumer cutover, parity checks, history reconstruction limits, failure recovery and rollback plan. Cross-link future issues [#49](https://github.com/tclare95/isHPPOpen/issues/49), [#50](https://github.com/tclare95/isHPPOpen/issues/50), [#51](https://github.com/tclare95/isHPPOpen/issues/51).
- [ ] 4.3 Review investigation output in a documentation PR. No production writes, archive deletions, secret changes, infrastructure deployment or model publication.

This investigation intentionally has `skip_specs: true`. Do not invent a behavioural capability spec or implement the selected backend as part of this change.
