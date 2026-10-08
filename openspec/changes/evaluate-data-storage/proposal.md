# Proposal: Evaluate observation data model and storage

## Why

The isHPPOpen suite has accumulated separately evolved MongoDB collections, repeated river-reading arrays, S3 latest/history objects, CSO archives and consumer-specific data fetching. MongoDB Atlas Free capacity is limited, and expanding to more measurements may multiply redundant history and indexes. We need a clear storage/model decision before changing production persistence.

## Accepted investigation outcome — 8 October 2026

See [ADR-001](../../../docs/decisions/0001-observation-storage.md) and [review PR #62](https://github.com/tclare95/isHPPOpen/pull/62). **DynamoDB on-demand + private S3 Standard** is the accepted *design* for gauge observations only; DynamoDB retains 365 rolling days full resolution, S3 retains canonical raw observations indefinitely, and history older than 365 days can be read directly via bounded S3 `GetObject`. MongoDB Atlas **Free** is retained initially for the remaining domains. This design signoff does **not** authorise production reads, infrastructure changes, migrations or deletion.

## What Changes

- Audit the **source-code** inventory of Mongo collections and S3 history/archives, query access patterns, retention, source freshness and expected growth. Live Atlas/S3 inventory is explicitly **deferred to implementation migration parity**, not required to decide the backend.
- Model stable `Source`, `Station`, `Measurement`, `Observation`, collection-run and archive metadata concepts; retain separate HPP open/closed transitions, CSO events, quality snapshots, alerts and forecasts where semantics differ.
- Compare improved MongoDB + S3, PostgreSQL + S3 and DynamoDB + S3 using representative query/workload patterns, security, regional placement, operating cost and migration complexity.
- Decide retention tiers and data ownership for latest, time-series history and immutable/raw archives using code evidence, theoretical volume models and owner risk/performance decisions; do not invent live metrics.
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

Do not claim live performance or cost measurements that were not taken; do not implement a generic ORM/repository framework; do not migrate existing data or require a fully general hydrology schema; do not conflate physical observations with forecasts, status events or CSO intervals.

## Done when

The ADR records source evidence and sizing assumptions, accepted storage/retention decisions, a target contract, migration sequencing/compatibility window, rollback and implementation acceptance requirements. The owner waived a dedicated feasibility prototype/benchmark and live inventory as architecture blockers.
