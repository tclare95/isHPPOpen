# Design: Minimal .NET river data platform foundation

## Repository and design principles

Create **`tclare95/river-data-platform`** as one modular .NET 10 AWS Lambda backend, not a collection of microservices. `river-observations` was a proposed name only and is superseded; do not provision both. Keep the existing OpenSpec path `bootstrap-dotnet-observation-service` and historical capability ID `observation-collector-foundation` to preserve links, without using those names as architectural constraints.

Prefer a few clear, testable project boundaries, such as:
- `RiverDataPlatform.Core` — minimal shared types/contracts, clock/time, source identity, config and common health outcomes, **not** one canonical record type for observations/events/forecasts.
- `RiverDataPlatform.Infrastructure` — adapter registration/hosting seams; initially no real AWS data store or provider implementation.
- `RiverDataPlatform.Lambda` — thin composition root and no-op scheduled collector handler. Future independently invoked collector/read Lambda entry points can join the **same repo/solution** without prematurely creating them.
- `RiverDataPlatform.Tests` — xUnit tests with fake clock, fake source/config and invocation context.

Avoid abstract base controllers, dynamic provider plug-ins, generic persistence CRUD frameworks, a universal event engine or separate projects for domains not yet implemented. Introduce actual observation and CSO domain entities/ports in [#49](https://github.com/tclare95/isHPPOpen/issues/49) and [#71](https://github.com/tclare95/isHPPOpen/issues/71)/[#72](https://github.com/tclare95/isHPPOpen/issues/72), not as empty scaffolds here.

## Platform module seams (documentation only in #64)

| Module | Future concern | Distinct contract |
| --- | --- | --- |
| Source / catalogue | Providers, stations, measurements, outfalls, explicit selection and provenance | Stable internal identity distinct from each upstream external identifier; site membership is separate from collection selection |
| Observations | Scalar river gauges, flow/rain, corrections and coverage | `measurementId + observedAt`; gauge-only 365-day Dynamo / indefinite S3 policy (ADR-001) |
| CSO | Current reported state vs effective freshness and events | Stable eventId/revision, separate source claims and 24-month completed-event hot retention |
| Forecast publications | Multiple independent model outputs | model/version, issuedAt/targetAt, optional bounds; no model execution in this repo in #64 |
| Site assessments | Reproducible outputs for a named site | Versioned assessment/input references, not a claim that geographical proximity proves upstream impact |
| Platform services | Auth/read API, collection health, stage isolation, integrity | Cross-cutting mechanisms only when first demanded by a domain change |

**Predictor boundary:** `trent-predictor` continues running Python independently and publishing its existing CSV/S3 contracts. A later publish/query API may consume those outputs or other models without importing their training or inference implementation into .NET.

## Host, configuration and tests

- AWS Lambda managed `dotnet10`; .NET SDK pinned in `global.json`. DI, `IHttpClientFactory`, `ILogger`, `System.Text.Json`, cancellation tokens and validated typed options; introduce no unneeded dependencies.
- One **disabled-by-default** EventBridge scheduled collector entry point. A no-op invocation with all domain collectors disabled returns a clearly typed `NotConfigured` or `Disabled` outcome without contacting any external source/storage. No permanent 15-minute scheduling assumption across every domain; gauge and CSO changes may independently select cadence (initially 15 minutes each).
- Environment config is explicit: `stage`, target region, intended AWS account, resource prefix and enabled feature list/flags. Unknown/invalid configurations fail safely; invalid stage/account identity cannot turn on polling implicitly.
- Emit structured per-run `runId`, environment, duration, outcome and safe error identifiers, without secrets, raw provider payloads, personal data or unsafe upstream content. Basic error/health alarm hooks only; per-measure and per-CSO health belong to later changes.
- Fixture tests prove startup/options validation, disabled host/no external calls, cancellation, diagnostics and stage isolation. Local and ordinary PR CI work without production credentials.

## AWS infrastructure / deployment

- New **AWS SAM** stack targeting **eu-west-1 provisionally**, with separate staging and production names, parameters, IAM roles, environment config and future storage resources. Existing experimental `riverscraper` Terraform state/account/roles/tables and old Node stacks must not be imported or touched.
- Implement an **explicitly manual** prepare/review/apply pipeline: obtain caller identity via AWS STS, compare account and region with recorded approved target, build/package/prepare SAM change set, inspect reviewed artifact identity and apply only through another manually authorised protected-environment step. **No pull request or main push can deploy/apply**.
- New Lambda permissions initially logs/minimum execution only. **No Dynamo/S3 live data credentials, API write privileges, provider secrets or production reads** in this foundation.
- Scheduled invocation disabled by default in each stage, including if a template is applied inadvertently. Staging and production resources remain separate. Staging apply itself also requires explicit authorisation; neither credentials nor regional assumptions should be guessed.
- CI runs restore, format verification, build, tests, SAM validation and reproducible packaging. CI validation is not an AWS rollout. Provide rollback/disable guidance without impacting old consumers.

## Dependencies and handoff

**First platform change:** this #64 foundation. Then the first complete vertical slice is configured gauge ingestion [#49](https://github.com/tclare95/isHPPOpen/issues/49) → verified archive [#65](https://github.com/tclare95/isHPPOpen/issues/65) → read API [#69](https://github.com/tclare95/isHPPOpen/issues/69); historical reconstruction [#50](https://github.com/tclare95/isHPPOpen/issues/50) and web cutover [#51](https://github.com/tclare95/isHPPOpen/issues/51) follow with separate approvals. Once foundation contracts are stable, CSO catalogue [#71](https://github.com/tclare95/isHPPOpen/issues/71) can proceed **in parallel** with gauge development, with CSO event storage/API [#72](https://github.com/tclare95/isHPPOpen/issues/72) following it. Shared files/infra changes should not be implemented concurrently without coordination.

No new AWS resources, credentials, external calls, legacy data movement or production system changes are authorised by merging this OpenSpec.
