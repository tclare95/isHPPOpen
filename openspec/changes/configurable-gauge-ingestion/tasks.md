# Tasks: Configurable EA gauge ingestion in the .NET service (#49)

## 1. Registry and contracts

- [ ] 1.1 Start from the independently buildable `river-data-platform` .NET 10 solution specified by [#64](https://github.com/tclare95/isHPPOpen/issues/64). Implement version-controlled, startup-validated EA measurement definitions, including Colwick and distinct Shardlow level and flow examples; new configurations must not enable production collection.
- [ ] 1.2 Define/test normalised source/station/measurement/observation IDs, exact UTC observed vs ingested timestamps, units/datum/quality/source provenance and corrections, with no synthetic timestamps.
- [ ] 1.3 Add EA adapter behind a typed provider interface, fixture tests for measurements and failure/429/invalid data, `HttpClientFactory` and bounded retry/timeout.

## 2. Staging DynamoDB adapter

- [ ] 2.1 Define on-demand Dynamo observation monthly measurement key and latest pointer, **365-day full-resolution** retention model, stage-isolated IaC/IAM and safe key encoding. Include support for level+flow sharing a station and observed UTC timestamp.
- [ ] 2.2 Implement idempotent conditional writes, source corrections, latest monotonicity, safe retry/unprocessed item handling, and persisting per-measurement collection cursor only after confirmed writes.
- [ ] 2.3 Implement bounded chronological monthly `Query`/GetLatest path with explicit continuation tokens and 24h/7d/365-day range tests. No unbounded Scan and **no TTL activation** in this change.

## 3. Orchestration and health

- [ ] 3.1 Add scheduled coordinator with bounded parallelism and overlap, independent per-measurement failure handling, run cancellation and watermark recovery. Tests: stale reading, timeout, rate-limit, replay and partial persistence failure.
- [ ] 3.2 Record structured per-measure last attempted run, outcome, observationAt, durable ingestAt, counts and freshness. Test distinction between healthy HTTP but outdated source data and a complete healthy update.

## 4. Delivery boundaries

- [ ] 4.1 Run .NET build/test/format checks, SAM validation and staging-only fixture/integration tests. Keep production schedule disabled, add no changes to legacy Node.js Lambda/CSO/HPP/forecast code or public legacy S3.
- [ ] 4.2 Document writer data contract and explicit handoff to [#65](https://github.com/tclare95/isHPPOpen/issues/65): permanent S3 archive/manifest first, then enable TTL eligibility/production shadow writes only after approval.
- [ ] 4.3 Link tests, deployment guardrails and implementation PR in [#49](https://github.com/tclare95/isHPPOpen/issues/49). Leave historical backfill to #50, web cutover to #51 and additional visible gauges to #52.

**No production cloud mutation or collector activation without a separately reviewed apply.** This is an additive new .NET backend change, not a refactor of `ishppopenScraper`.
