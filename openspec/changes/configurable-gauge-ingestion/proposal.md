# Proposal: Configurable EA gauge ingestion in new .NET backend

## Why

The old `ishppopenScraper` is a mixed-concern Node.js Lambda for river levels, HPP status, water quality, forecasts and CSOs. Its production responsibilities should not be refactored merely to introduce configurable gauge measurement ingestion. `riverscraper` was an exploratory .NET implementation in a possibly different AWS account and is not suitable to promote unchanged.

## What changes

- Implement the **new `river-observations` .NET 10 service** from [foundation #64](https://github.com/tclare95/isHPPOpen/issues/64), keeping old production Lambdas untouched.
- Load a version-controlled, validated EA gauge/measurement registry owned by the new collector (measurement—not station—identity is authoritative).
- Introduce a small EA provider adapter and a provider-neutral normalised observation contract; support multiple measurements at the same station and allow future providers without building them now.
- Poll eligible measures incrementally with bounded overlap/retry/concurrency, apply source corrections idempotently, and record independent per-measurement health.
- Use the approved [DynamoDB observation model](../../../docs/decisions/0001-observation-storage.md) for **365 rolling days** of full-resolution readings and conditional latest pointers. The permanent S3 archive and **safe TTL eligibility** arrive separately in [archive change #65](https://github.com/tclare95/isHPPOpen/issues/65). Stage-2 Dynamo writing is **staging/shadow only**; no production activation until archive safety is integrated and separately approved.

## Capabilities

### New capabilities
- `configurable-measurement-ingestion`: EA-only initial collector, configured from source control.
- `ingestion-health`: per-measure run outcome, source freshness and error isolation.

## Impact

**Implementation owner:** new `tclare95/river-observations` repository; canonical OpenSpec planning remains `tclare95/isHPPOpen`. This replaces the earlier plan to add the feature directly to `ishppopenScraper`. **Tracking:** [#49](https://github.com/tclare95/isHPPOpen/issues/49).

**Dependencies:** accepted [ADR-001](../../../docs/decisions/0001-observation-storage.md), new foundation [#64](https://github.com/tclare95/isHPPOpen/issues/64) and archive before approved production collection [#65](https://github.com/tclare95/isHPPOpen/issues/65). Historical backfill is [#50](https://github.com/tclare95/isHPPOpen/issues/50), web consumers [#51](https://github.com/tclare95/isHPPOpen/issues/51), additional advertised gauges [#52](https://github.com/tclare95/isHPPOpen/issues/52).

## Non-goals

No modifications or retirement of the old Node.js Lambdas, HPP/CSO/forecast refactor, old Mongo/S3 reconstruction, production rollout, admin UI, non-EA provider, user-facing dashboard change or full archive design in this slice.

## Compatibility / release

Additive service deployed to isolated stage/preview resources by a **separately approved manual release**. Existing Mongo `riverschemas`, public `levels/latest.json`, HPP, CSO and forecast outputs remain authoritative until explicitly migrated. A normal code merge never starts production collection.
