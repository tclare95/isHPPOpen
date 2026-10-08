# Design: Clean .NET collection service foundation

## Repository decision

Choose a **new repo** over resetting `riverscraper`. The old repo contains an auto-applying Terraform pipeline, a `eu-west-2` backend and an uncertain historical AWS account. A new repo creates a clean release/security boundary without assuming those resources are disposable. Old code may be consulted for EA URI/retry examples only.

## Target architecture

- **Runtime:** AWS Lambda managed `dotnet10`, .NET 10 SDK pinned in `global.json`. Single EventBridge 15-minute entry point after explicit activation, no per-station Lambda proliferation.
- **Simple solution:** `RiverObservations.Core` (provider-neutral identities/commands/interfaces), `RiverObservations.Infrastructure` (AWS and upstream adapters, added by later changes), `RiverObservations.Lambda` (thin composition/entry point), `RiverObservations.Tests` (xUnit with fake clock/HTTP/persistence).
- **Dependencies:** Microsoft DI, `IHttpClientFactory`, typed options with startup validation, `ILogger`, cancellation tokens and `System.Text.Json`; minimal library choices and no generic plug-in discovery framework.
- **Scope of bootstrap:** runnable but **disabled/no-op scheduled host**, health/logging and an application boundary returning an explicit `NotConfigured` outcome. No hard-coded station list, credentials or staging/prod reads/writes.
- **Deployment technology:** new **AWS SAM** stack for the standalone collector (consistent with the existing scraper's reviewed prepare/apply process). The Lambda, schedule, IAM and stage-specific data resources will be added incrementally by #49/#65. No Terraform imports or migration of legacy state.
- **AWS identity:** include separate `stage`, intended AWS account, region and unique stack/resource prefix as explicit deployment inputs. Prepare/apply must call STS `GetCallerIdentity` and fail closed on account or region mismatch. Never infer the new account from `riverscraper`'s ARN. Minimum IAM, bucket/table-level permission once those resources are defined.
- **CI and release:** PR/main workflows run restore, format/lint, build, test, `sam validate` and package dry-run without production credentials. Deployment is a separately triggered workflow requiring reviewed change set and explicit protected environment approval. Never auto-apply on push; record artifact identity/provenance for apply. A test does not imply an authorised deployment.
- **Observability:** structured per-invocation log fields (run ID, environment, duration, outcome), no secrets or raw upstream payload logging. Establish a basic error/freshness alarm hook; real per-measurement health arrives with #49.

## Failure and isolation

Unknown account, unset stage, missing required config, unsupported runtime or mistaken AWS identity SHALL fail before apply. No-op host returns diagnostics rather than trying to contact sources. Staging and production use different stacks/roles/resources. The old Node.js scraper and predictor remain authoritative.

## Deferred work

[#49](https://github.com/tclare95/isHPPOpen/issues/49) implements EA registry/ingestion + Dynamo hot writes; [#65](https://github.com/tclare95/isHPPOpen/issues/65) implements verified S3 history and safe expiry; [#50](https://github.com/tclare95/isHPPOpen/issues/50) handles historical backfill; [#51](https://github.com/tclare95/isHPPOpen/issues/51) handles web cutover. The deployment account choice requires explicit recorded owner approval, but **does not block writing or testing this source scaffold**.
