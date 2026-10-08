# Proposal: Configurable gauge and measurement ingestion

## Why

The current HPP scraper is centred on Colwick; the web's Trent dashboard fetches several EA gauges directly, and `riverscraper` is an independent multi-station DynamoDB prototype. Over time, this creates duplicated fetch logic, inconsistent measurement identity and provider-specific coupling. We want a single, testable ingestion foundation where adding an Environment Agency level or flow measurement is principally a version-controlled configuration change.

## What Changes

- Introduce one validated source/station/measurement registry owned by the collector. Start with Environment Agency flood-monitoring readings and a distinct provider-adapter boundary for later providers.
- Represent each measurement independently of its station, with external EA measure IDs, parameter, units, reference/datum when known, UTC observation time, ingestion time and source provenance.
- Use per-measurement collection cursors or watermarks, bounded overlap/backfill, robust source failures, correction rules and idempotent writes to the store selected by `evaluate-data-storage`.
- Record per-source/per-measurement collection run health, latest successful observation and lag; avoid pretending a successful HTTP fetch guarantees fresh readings.
- Provide an independently testable, shadow-capable collection path; preserve production `levels/latest.json`, Mongo `riverschemas`, HPP status, CSO and web/predictor consumers during rollout.

## Capabilities

### New Capabilities

- `configurable-measurement-ingestion`: Add and collect supported measurements through a validated source-control configuration, independent of web page display choices.
- `ingestion-health`: Report collection outcomes and freshness per configured measurement while isolating failed measurements.

### Modified Capabilities

None currently canonical in OpenSpec. The existing single-station production collector remains authoritative until a separately approved migration.

## Impact

**Primary code owner:** `tclare95/ishppopenScraper`, with the OpenSpec change stored centrally in `tclare95/isHPPOpen`. Review but do not directly merge the `riverscraper` or `reservoir-levels` repositories. `trent-predictor` is an independent consumer, not part of initial migration.

**Dependency:** complete the backend-neutral identity contract and resolve storage choice via [`evaluate-data-storage`](../evaluate-data-storage/proposal.md) / [#48](https://github.com/tclare95/isHPPOpen/issues/48) before writing production storage adapters or promoting new ingestion.

**Tracking:** [Issue #49](https://github.com/tclare95/isHPPOpen/issues/49).

**Release:** additive, side-by-side production review; independent AWS manual deployment; do not automatically switch or delete S3/Mongo keys. An admin UI and additional provider integrations are not part of this change.

## Non-goals

No global hydrology platform, web station-management UI, wide provider catalogue, migration of the existing complete archive, changes to user-facing dashboards/alerts, replacement of CSO/water-quality collection, predictor retraining, or automatic deployment.
