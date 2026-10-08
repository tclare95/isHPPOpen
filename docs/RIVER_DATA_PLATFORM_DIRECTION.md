# River data platform — agreed direction (8 October 2026)

## Intent

Evolve the concepts behind isHPPOpen into **one unified, reusable river/environmental data backend**, initially serving isHPPOpen but independent of that UI, a single gauge, or one water company. Implement an appropriately modular **.NET backend repository with independently invoked collector/reader Lambda entry points**, not a monolithic scraper and not multiple independently managed microservices.

**Implementation repository:** the agreed preferred name is **`tclare95/river-data-platform`**, replacing the previously proposed `tclare95/river-observations` **before repository creation**. Bootstrap is tracked by [#64](https://github.com/tclare95/isHPPOpen/issues/64) and its existing OpenSpec change slug `bootstrap-dotnet-observation-service` (retained for link stability). No repository or cloud resources have been created by the architecture planning. Do not duplicate scaffolds or alter accepted gauge keys/storage/IAM merely because the backend now has a wider purpose.

## Domain boundaries

| Domain | What it owns | Not to be confused with |
| --- | --- | --- |
| Catalogue | Provider, monitoring station, asset/outfall, measurements, optional site/link identities and independent collection configuration | A site impact/routing model, admin UI or imperative “poll everything” instruction |
| Observations | River level/flow/rainfall and other timestamped scalar readings, 365d Dynamo and indefinite private S3 per accepted ADR-001 | Event intervals, forecast runs or water-quality assessments |
| CSO / spill events | Source status evidence, current monitor state, spill intervals, identity/revisions, 24-calendar-month hot event queries and older S3 history | Physical water quality measurements or site-specific risk |
| Forecasts | Provider/model-neutral forecast run, issue time, target time, model/version, predicted value and optional uncertainty/provenance | Model training and inference execution |
| Site assessments | Reproducible derived condition/risk for an explicitly configured location using identified source data and assessment revision | A source provider's raw state or proof that a CSO is upstream |
| Platform services | IAM API, source/range coverage and provenance, polling/retention health, archive integrity, deployment isolation | A universal scalar observation table or shared business logic for every source |

The **existing Python predictor remains independently deployed**: it is an experiment with a useful current output, but its internal architecture is not to become the general platform prediction engine. A future bounded specification may define a publish/query forecast contract, not import model training or scheduling into the initial backend.

## Selection and sites

CSO v1 keeps a provider-discovered complete asset catalogue separate from **version-controlled, explicit outfall IDs in named selection sets**. New provider assets do not automatically enter operational polling. Missing configured IDs remain in config and are reported unresolved; valid peers continue to collect. Sewage Map-derived HPP selections may be imported once with attribution and review, but **must not be queried at runtime to determine polling**.

HPP is one consumer/site configuration. A provider outfall or spill exists independently of any current site's assessment. Automatic hydrological upstream routing/geographic selection is deferred; a point's physical proximity does not establish upstream impact.

## Storage and release

Gauge observation retention remains governed by [ADR-001](decisions/0001-observation-storage.md) (365d hot; S3 Standard indefinitely). CSO events have **their own** 24-calendar-month-after-verified-end hot retention and S3 archive contract [modernise-cso-data](../openspec/changes/modernise-cso-data/proposal.md). Open/unresolved events never expire from hot storage. New CSO archival evidence is directly readable from private S3; existing Glacier-transitioned legacy archives are not assumed to be.

The existing web/Node/Mongo/forecast and alert contracts remain unchanged until independently verified and approved cutovers. Staging/production IAM, source resources and releases are isolated; no documentation-only PR authorises AWS apply, production data operations, source migration, TTL activation or scraper retirement.

## Bounded specification path

0. [Unified platform foundation](../openspec/changes/bootstrap-dotnet-observation-service/proposal.md) ([#64](https://github.com/tclare95/isHPPOpen/issues/64)) — first implementation, .NET 10 solution, inert Lambda, CI, stage/account guards and manual AWS release, with no live ingestion or storage.
1. [First gauge vertical slice](../openspec/changes/configurable-gauge-ingestion/proposal.md) ([#49](https://github.com/tclare95/isHPPOpen/issues/49) → [#65](https://github.com/tclare95/isHPPOpen/issues/65) → [#69](https://github.com/tclare95/isHPPOpen/issues/69)) — configured EA measurement collection, S3 retention, server-only read API.
2. [CSO catalogue and selection](../openspec/changes/cso-asset-catalogue-and-selection/proposal.md) ([#71](https://github.com/tclare95/isHPPOpen/issues/71)): discover asset catalogue, explicit selection, validated plan and collection scheduling.
3. [CSO ingestion, event revisions and history](../openspec/changes/modernise-cso-data/proposal.md) ([#72](https://github.com/tclare95/isHPPOpen/issues/72)): Severn Trent source claims, current and event records, tiered storage and shared internal read API.
4. **Later:** CSO historical EDM/Mongo/Glacier reconciliation; site-to-CSO relationships and assessment logic; modular replacements for legacy HPP, CSO and forecast-publisher duties ([#68](https://github.com/tclare95/isHPPOpen/issues/68)); predictor publish/query contract and additional provider adapters.

These are *modular parts of one platform*, not proof that the same physical database table, IAM role or retention lifecycle suits every domain.
