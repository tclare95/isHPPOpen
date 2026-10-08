# Proposal: Evaluate observation data model and storage

## Why

The isHPPOpen suite has accumulated separately evolved MongoDB collections, repeated river-reading arrays, S3 latest/history objects, CSO archives and consumer-specific data fetching. MongoDB Atlas Free capacity is limited, and expanding to more measurements may multiply redundant history and indexes. We need a measured storage/model decision before committing to a costly migration.

## What Changes

- Perform a **read-only** inventory of current collection/document/index footprints, S3 history and archives, query access patterns, retention policies, source freshness and expected growth.
- Model stable `Source`, `Station`, `Measurement`, `Observation`, collection-run and archive metadata concepts; retain separate HPP open/closed transitions, CSO events, quality snapshots, alerts and forecasts where semantics differ.
- Compare improved MongoDB + S3, PostgreSQL + S3 and DynamoDB + S3 using representative query/workload patterns, security, regional placement, operating cost and migration complexity.
- Decide retention tiers and data ownership for latest, time-series history and immutable/raw archives based on explicit evidence.
- Produce an architecture decision record (ADR), an illustrative provider-neutral observation contract, data migration and rollback plan, and an ordered implementation backlog.

## Capabilities

### New Capabilities

None. This is a storage/design investigation and does **not** change system behaviour. This change deliberately uses `skip_specs: true`.

### Modified Capabilities

None.

## Impact

**Repositories in scope for investigation:** `isHPPOpen`, `ishppopenScraper`, `trent-predictor`; review patterns in `riverscraper` and `reservoir-levels` for reuse. Implementation ownership remains with individual repos.

**Existing contracts to preserve:** Mongo status, event, CSO and alert consumers; S3 `levels/latest.json` and forecast CSV and archive keys; UTC, metres/flow units, station and measure identities, and operational-health semantics.

**Output:** ADR and bounded follow-up issues. No production SQL/schema modifications, backfill, index creation, secrets handling, model publishing or data movement in this change.

**Tracking:** [Issue #48](https://github.com/tclare95/isHPPOpen/issues/48).

## Non-goals

Do not pick PostgreSQL, DynamoDB or MongoDB based on preference alone; do not implement a generic ORM/repository framework; do not migrate existing data or require a fully general hydrology schema; do not conflate physical observations with forecasts, status events or CSO intervals.

## Done when

The ADR includes evidence, quantitative capacity/cost estimates, representative read and write benchmarks or reasoned limitations, an unambiguous target contract, migration sequencing/compatibility window, data retention and rollback plan, and decisions needed by subsequent OpenSpec changes.
