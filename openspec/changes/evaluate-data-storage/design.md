# Design: Storage evaluation protocol

## Current state and key risks

- `ishppopenScraper/is-hpp-open-scraper/is-hpp-open/app.mjs` writes repeating `level_readings` arrays to `riverschemas`, plus `waterQuality`, `csoData` and `openIndicator`; it also publishes S3 `levels/latest.json` and dated history. Weekly CSO archival exists, with verify-before-delete behaviour.
- The web reads Mongo collections for editorial/admin, CSOs, alert state and HPP transitions, while its Trent dashboard fetches multiple EA gauges directly.
- `trent-predictor` fetches EA readings for inference and publishes forecast/quality CSVs to S3.
- `riverscraper` offers a station-configurable DynamoDB prototype but keys station+timestamp without a distinct measurement dimension; level and flow for one station can collide.
- `reservoir-levels` demonstrates PostgreSQL/Drizzle and source-specific adapters but uses slower periodic report data, not frequent time-series observations.

## Method

1. **Inventory and measure.** Record collection row counts, approximate data/index bytes, oldest/newest timestamps, indexes, document distribution, growth, query patterns and S3 object counts/bytes. Separate operational control documents from historical measurements. Use read-only commands/permissions and approved, non-sensitive aggregates. Do not copy personal contact details or secrets into the ADR.
2. **Define logical schema.** Every `Measurement` has stable provider, station and external-measure identity; its unit/parameter/datum are explicit. An `Observation` is unique by measurement identity and observed UTC timestamp, supports quality/provenance and distinguishes observed versus collected time. Corrections/duplicate feeds need an explicit deterministic rule. Forecasts require issue/target timestamps and their own structure; HPP threshold transitions and CSO spill intervals are not scalar observations.
3. **Model realistic workload.** Baseline and scenarios for current stations plus 25, 100 and 500 measurements, at 15-minute observation cadence with growth over 1/3/5 years. Include latest-point, 24-hour/7-day/year-history, bounded station comparisons, alert evaluation, backfill, bulk ingest and operational-health queries. Storage unit/cost assumptions must be dated and verified before conclusions.
4. **Compare viable approaches.** Improved MongoDB with normalised observations and archival; PostgreSQL with necessary composite indexes, partitions if justified and S3 archival; DynamoDB with correctly dimensioned keys and predictable access patterns. Estimate storage+index usage, backup, compute, network, cross-region traffic, transfer, migration cost and operator burden. A hybrid operational DB+S3 pattern is an option, not a preselected outcome.
5. **Decide retention.** Explicit hot data, warm aggregates and immutable/raw S3 history; document data export accessibility and deletion/archival verification. Avoid relying on short TTL where full history is an explicit requirement.
6. **Stage migration.** Add producer and consumer compatibility boundaries, dual write/read or shadow validation as warranted, count and sample reconciliation, safe fallback to existing Mongo/S3 consumers, independent web/AWS deploy ordering and recovery steps. Never use live production as a benchmark target with mutating operations.
7. **Decision and handoff.** Record architecture decision, alternatives rejected, assumptions and measurable thresholds, provider-neutral contract and migration actions to issues #49–#52.

## Outputs

A concise ADR under `docs/decisions/` (or adjacent existing docs), with an explicit storage-choice outcome or a clearly identified remaining evidence gap. Keep generated benchmarks/fixtures non-sensitive and checked in only if small and appropriate. No production application changes.

## Risks

False precision in cloud pricing, unknown Mongo indexes, failed source history gaps and cross-region Lambda/DB access. Cite dates and inputs for cost estimates, distinguish verified from assumed, and secure explicit operational consent before running any analysis on real production databases.
