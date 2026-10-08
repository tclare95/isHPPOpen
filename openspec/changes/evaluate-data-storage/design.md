# Design: Storage evaluation and completed handoff

**Outcome (8 October 2026):** [ADR-001](../../../docs/decisions/0001-observation-storage.md) is **Accepted** for DynamoDB on-demand + private S3 Standard **gauge-observation** storage only. Keep 365 days full resolution in Dynamo, retain raw observations indefinitely in S3, read older history by direct S3 `GetObject`, and migrate observations first while leaving MongoDB Atlas Free for CSO, HPP events, editorial and alerts. The owner does **not** require a separate infrastructure prototype, full live database inventory, historical-read latency benchmark or exact regional bill as architecture acceptance gates. No production operations are authorised.

## Current state and key risks

- `ishppopenScraper/is-hpp-open-scraper/is-hpp-open/app.mjs` writes repeating `level_readings` arrays to `riverschemas`, plus `waterQuality`, `csoData` and `openIndicator`; it also publishes S3 `levels/latest.json` and dated history. Weekly CSO archival exists, with verify-before-delete behaviour.
- The web reads Mongo collections for editorial/admin, CSOs, alert state and HPP transitions, while its Trent dashboard fetches multiple EA gauges directly.
- `trent-predictor` fetches EA readings for inference and publishes forecast/quality CSVs to S3.
- `riverscraper` offers a station-configurable DynamoDB prototype but keys station+timestamp without a distinct measurement dimension; level and flow for one station can collide.
- `reservoir-levels` demonstrates PostgreSQL/Drizzle and source-specific adapters but uses slower periodic report data, not frequent time-series observations.

## Method and investigation conclusions

1. **Read-only source audit completed:** mapped Mongo collections, repeated river arrays, S3 latest/history/CSO archives, predictor CSVs, health and application consumers across the suite. Live collection/index/S3 byte counts were **not** queried. The existing Atlas cluster is Free (published capacity ceiling 512 MB), not a measured collection size.
2. **Backend-neutral contract completed:** stable source/station/measurement identity, `measurementId + observedAt UTC` observation key, unit/datum, observed/ingested time, provenance, corrections and idempotency. HPP transitions, CSO snapshots/incidents, forecasts and alert operational state remain separate.
3. **Proportionate capacity and alternatives completed:** theoretical 25/100/500-measure 15-minute-cadence calculations, 1/3/5-year point counts and 5/10/20-year S3 archive growth; pricing explicitly illustrative, not a current eu-west-1 quote. Compared normalized Mongo+S3, PostgreSQL+S3 and DynamoDB+S3 using existing query shapes.
4. **User-directed choice:** DynamoDB monthly measurement partitions for bounded latest/365-day history; S3 Standard compact immutable per-measure/date partitions and manifests for indefinite raw history with direct GET/filter reads. No S3 Select, Athena, separate data warehouse or historical p95 SLA required.
5. **Safe rollout defined, not executed:** additive producer writers, S3 archive verification before hot-data TTL eligibility, bounded read-only Mongo/S3 baseline when backfill runs, shadow parity, reversible consumer switch, IAM/Preview isolation and legacy fallback. No prototype resource deployment, migration or production benchmarking in this investigation.

## Implementation acceptance delegated

- **#49:** measurement identity, duplicate and correction handling, Dynamo latest/query paths, bounded pagination, health and narrow IAM.
- **#50:** actual migration-time source counts/coverage, S3 Standard object/manifests/checksums, permanent raw retention, direct historical GET, verified expiry and recovery.
- **#51:** 365-day Dynamo/raw older-than-year S3 historical APIs, existing response envelopes/health, rollback and Preview isolation.
- **Deployment:** sensible eu-west-1 cost/alarms and a normal staging smoke test. No dedicated synthetic 500-measure infrastructure prototype required.

## Outputs

Accepted [ADR-001](../../../docs/decisions/0001-observation-storage.md) and updated [tasks.md](tasks.md), prepared through [PR #62](https://github.com/tclare95/isHPPOpen/pull/62). Production implementation, live metrics and regional billing verification remain follow-on work; no production application or infrastructure changes were made.

## Risks

False precision in cloud pricing, unknown Mongo indexes, failed source history gaps and cross-region Lambda/DB access. Cite dates and inputs for cost estimates, distinguish verified from assumed, and secure explicit operational consent before running any analysis on real production databases.
