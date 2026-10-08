# Proposal: Bootstrap a unified .NET river data platform

## Why

isHPPOpen's existing Node scraper mixes river observations, HPP threshold transitions, water-quality indicators, CSO polling and legacy publishing. The aim is **one reusable river/environmental data backend**, initially serving isHPPOpen but designed to support multiple rivers, providers, locations and future consumers. It must not become either another single-purpose gauge scraper or a prematurely generic multi-service framework.

The existing `ishppopenScraper` and independent Python `trent-predictor` remain authoritative until separate, verified consumer migrations. The legacy `riverscraper` prototype may have been deployed in a different AWS account and has an auto-applying Terraform workflow; none of its resources, state or deployment assumptions may be inherited.

## What changes

- Create **one new repository, `tclare95/river-data-platform`**, containing the shared .NET 10 Lambda foundation for later observation, CSO and other modules. This supersedes the previously *proposed* `river-observations` repository name **before repository creation**; do not create a second scaffold or reuse `riverscraper`.
- Build a small testable solution with minimal cross-cutting infrastructure, source/provider identity and configuration conventions, application orchestration, structured logging/health and independent Lambda entry points **as needed by subsequent changes**. No common all-purpose observation/event record or retention policy.
- Include one safely **disabled/no-op collector host** with explicit `NotConfigured`/disabled outcome. No live providers, writes, reads from existing production data or activated schedule in this slice.
- Provide AWS SAM scaffolding with separate stage-specific stacks/roles, account-and-region fail-closed checks, a provisionally selected **eu-west-1** region and a reviewed, **manual prepare → review → apply** workflow only. No PR/main-triggered AWS apply.
- Add pinned .NET 10 SDK, reproducible CI (restore, format/build/test, SAM validation), fixture-driven xUnit tests, concise README/AGENTS/deployment handoff.

## Modular platform boundaries

The foundation documents extension seams; **none of these domain features is implemented by #64**:

- **Catalogue and configuration:** independent source/provider, station/measurement and outfall/asset identities; explicit version-controlled selections (see CSO [#71](https://github.com/tclare95/isHPPOpen/issues/71)).
- **Hydrological observations:** gauge levels, flow and later rainfall/other scalar time series; EA collector [#49](https://github.com/tclare95/isHPPOpen/issues/49), gauge-specific Dynamo/S3 archive [#65](https://github.com/tclare95/isHPPOpen/issues/65), shared authenticated API [#69](https://github.com/tclare95/isHPPOpen/issues/69).
- **CSO operational state and events:** provider-reported snapshots, spill intervals, revisions and their **separate** 24-calendar-month completed-event hot retention; [#71](https://github.com/tclare95/isHPPOpen/issues/71) then [#72](https://github.com/tclare95/isHPPOpen/issues/72).
- **Forecast publications:** future model-neutral output contract (model/run/issue/target times and optional uncertainty) while Python training/inference stays an **independent service**.
- **Site assessments:** separately versioned, reproducible derivations tied to source data; HPP's particular rules are **not** platform-wide assumptions.

See [platform direction](../../../docs/RIVER_DATA_PLATFORM_DIRECTION.md). [ADR-001](../../../docs/decisions/0001-observation-storage.md) applies specifically to **gauge observations**, not to all domains.

## Capabilities

### New foundation capability (historical identifier retained)

- `observation-collector-foundation`: **retained historical OpenSpec capability identifier**, now describing a safe, independently buildable **shared platform foundation** with an inert collector entry point. Keep this identifier and the existing `bootstrap-dotnet-observation-service` change slug for tracking continuity; implementation namespace/repository is `RiverDataPlatform`.

## Impact and dependencies

**Implementation owner:** new `tclare95/river-data-platform` repository, created only by an expressly authorised implementation task; **canonical OpenSpec and issues:** `tclare95/isHPPOpen` ([#64](https://github.com/tclare95/isHPPOpen/issues/64)). Existing gauge and CSO specs stay separate. Dependency: accepted observation-specific ADR-001 for future gauge persistence, not for generic bootstrapping. Experimental AWS inventory is separately [#66](https://github.com/tclare95/isHPPOpen/issues/66).

## Non-goals

No real EA/CSO ingestion, asset discovery, DynamoDB/S3 storage or retention policies, historical backfill, API read routes, forecasts, HPP/site logic, web/alert changes, model migration, provider-agnostic plug-in framework, event bus, GIS routing, legacy data access or infrastructure retirement. No production activation, resource creation or decommissioning.

## Release and rollback

Source/CI scaffolding may be developed without AWS credentials. Any staging/prod infrastructure creation or schedule activation needs separately recorded explicit approval, correct AWS identity and reviewed manual apply. The old system stays untouched; before any new consumer is switched, rollback remains independent of legacy production.
