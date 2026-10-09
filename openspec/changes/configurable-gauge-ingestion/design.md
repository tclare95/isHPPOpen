# Design: .NET measurement ingestion and Dynamo hot observations

## Core model and provider boundary

- **Config:** version-controlled `measurements.json` (or documented equivalent), owned by the new collector and validated in CI/startup. Each enabled entry includes stable provider ID, station ID, **external measure ID**, parameter (level/flow), source unit/datum or explicit unknown, expected interval, enabled flag, optional label and maximum backfill/overlap rule. Reject duplicate measure identities, invalid provider metadata/units and ambiguous aliases. No admin UI and no second authoritative web registry.
- **Domain:** `Source`, `Station`, `Measurement`, `Observation`, `CollectionRun`. Canonical observation identity `provider + providerMeasureId + observedAt UTC`, represented by stable app measurementId plus exact timestamp. Store source value/precision, unit/datum, quality, observedAt, ingestedAt, sourceUpdatedAt/provenance and correction revision. Level and flow are independent, even when their timestamps are identical. No fabricated gap readings. Forecasts/HPP events/CSO intervals are not scalar observations.
- **Adapter:** `IObservationSource.FetchAsync(measurement, sinceUtc, cancellationToken)` with a typed EA implementation. Use `IHttpClientFactory`, bounded timeout/retry/backoff for transient failure/429, configuration-derived EA measure endpoint, defensively parse malformed/incomplete timestamps and values. Reject unexpected measure IDs, units or timestamps rather than silently coercing data. Fixture tests for level and flow.
- **Coordinator:** per-enabled-measure, controlled concurrency, source-aware 15-minute polling schedule, durable cursor/last persisted observedAt plus bounded overlap for corrections; do not advance cursor on only-HTTP success or before persisted data. On source outage other measures complete. Retry safely on next invocation; no uncontrolled fan-out or self-invocation.

## DynamoDB hot-store contract

Per [ADR-001](../../../docs/decisions/0001-observation-storage.md), Dynamo on-demand, eu-west-1 default. Observation `PK = measurementId#YYYY-MM`, `SK = observedAt fixed-width UTC ISO 8601`; latest pointer per measurement in same logical store or separate small table. Conditional source-revision-aware writes (or explicit compare/replace with concurrency control) ensure repeated overlapping reads don't duplicate samples and older retries don't overwrite newer corrections. Do **not** blindly `BatchWriteItem` and discard `UnprocessedItems` (the old prototype's flaw); every write is acknowledged or retried with bounded backoff. Latest advances only for a newer observedAt or an authorised correction at equal observedAt.

APIs/access methods exposed behind a narrow persistence interface: write/compare, latest, read bounded time range by measurement and monthly partition with Dynamo continuation tokens, retrieve persisted cursor and health. Explicit read limits; never use unbounded Scan for a chart. Samples must be retained at full resolution for 365 days after observation and protected from premature TTL by the archive change. **Do not enable observation TTL or production writing from this change alone.**

## Failure handling and diagnostics

A run includes runId, stage, start/end, per-measure attempted/fetched/new/duplicate/corrected counts, last source observed time, last durable ingest time, lag and outcome. HTTP 200 with no newer reading is a **successful fetch but stale data**; it does not imply fresh observations. Per-measure logging uses structured IDs and safe summaries, no credential/raw payload dump. Source/provider failure, Dynamo throttling/partial writes and malformed values are clearly distinguishable. Alarm/cost hooks can be implemented with the foundation's stage-specific logging/monitoring.

## Rollout dependencies

1. Bootstrap the isolated .NET service (#64).
2. Implement and test EA source/config and Dynamo hot model (#49) **in non-production stage only**.
3. Complete permanent S3 archive/manifest and verify-before-TTL integration (#65) and review operational configuration.
4. An independently approved producer activation permits **shadow data collection** without changing public `levels/latest.json`, Mongo/HPP and predictor outputs. After parity, #50/#51 handle backfill and consumer switch. Rollback stops the new scheduled collector or switches read preference without touching old Lambdas.

OpenSpec and issues remain in the web repo; code/tests/IaC remain in the new backend repo. This design deliberately does not migrate the existing Node.js scraper.

## Small on-demand integration stage

The initial registry SHALL allow explicit stage-specific enabled measurements without changing production measurement IDs or source selection. The expected staging smoke selection is 1–3 EA measures; a staging deployment must not implicitly enable every known gauge. Source adapter and Dynamo persistence are validated primarily with fixture/mock tests; isolate staging tables and IAM from production even if the AWS account is shared. New collection schedules remain disabled except for deliberately authorised bounded invocations. Stage Dynamo tables use on-demand capacity and start nearly empty. **Do not set an accelerated stage TTL on canonical observations**: test 365-day expiry and archive-first eligibility with fake clock and historical fixtures, while handling any separately approved disposable-stage cleanup outside the domain ingestion algorithm. Stage-A inert foundation deployment and Stage-B end-to-end archival smoke are owned by [#75](https://github.com/tclare95/isHPPOpen/issues/75), with Stage B gated on #65.
