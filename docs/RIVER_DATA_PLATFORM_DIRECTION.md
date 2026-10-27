# River data platform — agreed direction (8 October 2026)

## Intent

Evolve the concepts behind isHPPOpen into **one unified, reusable river/environmental data backend**, initially serving isHPPOpen but independent of that UI, a single gauge, or one water company. Implement an appropriately modular **.NET backend repository with independently invoked collector/reader Lambda entry points**, not a monolithic scraper and not multiple independently managed microservices.

**Implementation repository:** **`tclare95/river-data-platform`**, with its [inert .NET 10 foundation merged](https://github.com/tclare95/river-data-platform/pull/1). Bootstrap is tracked by [#64](https://github.com/tclare95/isHPPOpen/issues/64) and stable change slug `bootstrap-dotnet-observation-service`. This code merge did **not** deploy AWS resources or activate collection; preserve the established gauge/CSO domain separation.

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

The existing web/Node/Mongo/forecast and alert contracts remain unchanged until independently verified and approved cutovers. **Staging is a minimal, mostly idle, on-demand integration stage, not a second full production replica**: small explicit source selections, tiny separate Dynamo/S3 storage, disabled schedules by default, fixture-based historical tests and a cost alert. Staging/prod IAM, writable resources and releases remain isolated even if using one approved AWS account. [Lightweight staging/deployment #75](../openspec/changes/lightweight-integration-deployment/proposal.md) controls separately approved Stage-A inert AWS deployment and Stage-B tiny real-source smoke after #49 + #65. No documentation-only PR authorises AWS prepare/apply, production data operations, source migration, TTL activation or scraper retirement.

## Bounded specification path

1. [Unified platform foundation](../openspec/changes/bootstrap-dotnet-observation-service/proposal.md) ([#64](https://github.com/tclare95/isHPPOpen/issues/64)) — first implementation, .NET 10 solution, inert Lambda, CI, stage/account guards and manual AWS release, with no live ingestion or storage.
2. [Small stage AWS deployment](../openspec/changes/lightweight-integration-deployment/proposal.md) ([#75](https://github.com/tclare95/isHPPOpen/issues/75)) — manual inert foundation deployment after approval may proceed now; **real EA smoke after #49 + #65**. No permanent full staging history.
3. [First gauge vertical slice](../openspec/changes/configurable-gauge-ingestion/proposal.md) ([#49](https://github.com/tclare95/isHPPOpen/issues/49) → [#65](https://github.com/tclare95/isHPPOpen/issues/65) → [#69](https://github.com/tclare95/isHPPOpen/issues/69)) — configured EA measurement collection, S3 retention, server-only read API.
4. [CSO catalogue and selection](../openspec/changes/cso-asset-catalogue-and-selection/proposal.md) ([#71](https://github.com/tclare95/isHPPOpen/issues/71)): discover asset catalogue, explicit selection, validated plan and collection scheduling.
5. [CSO ingestion, event revisions and history](../openspec/changes/modernise-cso-data/proposal.md) ([#72](https://github.com/tclare95/isHPPOpen/issues/72)): Severn Trent source claims, current and event records, tiered storage and shared internal read API.
6. **Later:** CSO historical EDM/Mongo/Glacier reconciliation; site-to-CSO relationships and assessment logic; modular replacements for legacy HPP, CSO and forecast-publisher duties ([#68](https://github.com/tclare95/isHPPOpen/issues/68)); predictor publish/query contract and additional provider adapters.

These are *modular parts of one platform*, not proof that the same physical database table, IAM role or retention lifecycle suits every domain.

## Gauge migration and future consumers (20 October 2026)

- [Historical backfill #50](../openspec/changes/migrate-observation-storage/proposal.md): recover all reasonably available legacy gauge evidence. **Automatic imports only fill absent canonical measurement/timestamps**, with reviewed correction required for any conflict with RDP; archive-first and source/gap reconciliation.
- [Multi-gauge parity #52](../openspec/changes/expand-multi-gauge-support/proposal.md): complete the existing six dashboard measurements and make provider/station/measurement registration independent of collection and private-catalogue publication. Existing web presentation remains curated.
- [Web read migration #51](../openspec/changes/unify-gauge-consumers/proposal.md): server-only Vercel AWS IAM client, independently configured legacy/shadow/rdp readers, fresh legacy **display** fallback and deliberately conservative **alert** evaluation; roll out Trent → observed levels → gauge alerts. #52 six-series parity precedes full cutover; #50 older history can continue in parallel once necessary recent windows have been verified.
- isHPPOpen is RDP's **sole initial consumer**. A future standalone [RDP playground #77](https://github.com/tclare95/isHPPOpen/issues/77) should use the same canonical internal data APIs, potentially through a server-side gateway. The [public API/developer-access idea #78](https://github.com/tclare95/isHPPOpen/issues/78) is **separate**, with its own future decisions on anonymous/registered authentication, gateway, limits and costs. Do not expose IAM credentials, raw Lambdas or data storage through a browser/public API as a side effect of this migration.

These changes are documentation-only until their own implementation/release approvals. The RDP #49/#65 source merges did not themselves approve or execute AWS deployment.

## Production deployment decision (27 October 2026)

[Production observation deployment OpenSpec](../openspec/changes/production-observation-deployment/proposal.md), tracking [#81](https://github.com/tclare95/isHPPOpen/issues/81), governs **same-account but resource/IAM-isolated** Production in the approved `eu-west-1` AWS account. Independent production stacks/roles/data stores and IAM-backed read API are required; staging stays idle except approved integration checks. The existing [RDP #69 read service](https://github.com/tclare95/river-data-platform/pull/10) was deployed to staging and passed signed smoke via [PR #16](https://github.com/tclare95/river-data-platform/pull/16), but this neither authorises production nor verifies Vercel Preview identity.

Production is enabled in separately approved phases: inert foundation, retained Dynamo/S3 observation storage, bounded three-measure collection smoke, 15-minute monitored schedule, six-series expansion after #52, production authenticated read API, and finally independent #51 web shadow/cutover. Initial collection keeps Dynamo TTL **off**; archive-first, 365-day hot and indefinite S3 Standard policy remain unchanged.

For outages, normal retries operate within the collector's bounded lookback; **beyond lookback, preserve cursors and require operator-reviewed bounded catch-up**. If the source cannot supply all readings, explicit UTC gap evidence and approval precede a guarded cursor resumption. No silent jump-to-now or automatic overwrite of existing canonical measurements. #50 historical reconstruction and the legacy Node scraper remain separate.

The production OpenSpec and its documentation PR authorise **zero AWS setup, prepare/apply, scheduled invocation, new production IAM, TTL, backfill or web cutover**.
