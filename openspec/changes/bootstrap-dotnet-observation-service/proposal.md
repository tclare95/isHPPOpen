# Proposal: Bootstrap a .NET observation backend

## Why

The current `ishppopenScraper` Lambdas mix river polling, HPP status changes, water quality, CSO and legacy Mongo/S3 writes. They should stay running unchanged while gauge ingestion moves to an independently deployable backend. The former `riverscraper` .NET prototype was deployed but is no longer useful; its AWS account and Terraform state may be unrelated to the active isHPPOpen environment, and its GitHub workflow applies Terraform on main pushes.

## What changes

- Establish a **new repository, `tclare95/river-observations`**, with a clean .NET 10 managed-runtime Lambda foundation. Do **not** transplant or rename legacy Terraform state, Dynamo tables, IAM roles or pipelines from `riverscraper`.
- One small scheduled-host solution with separated domain contracts, orchestration and infrastructure adapters; shared logging/configuration and fixture-driven xUnit tests.
- AWS **eu-west-1** target by default, with **separate stage-specific stacks** and an explicitly recorded/verified AWS account identity before any apply.
- Build/test/package/validate CI; production deploy is **manual prepare -> reviewed change set -> manual apply**, never on PR or a push to main.
- Create guidance for the subsequent EA ingestion (#49), S3 archive (#65), historical migration (#50) and web consumers (#51); leave the old Lambdas and predictor alone.

## Capabilities

### New capabilities
- `observation-collector-foundation`: independently buildable, inspectable, stage-isolated, deployable collector host with no accidental production activation.

## Impact

**New code owner:** proposed `tclare95/river-observations` (create when scaffolding is authorised); canonical planning and issue tracking remain `tclare95/isHPPOpen`. No backend repo or AWS resource is created by this documentation change.

**Tracking:** [#64](https://github.com/tclare95/isHPPOpen/issues/64). **Dependency:** [ADR-001 / PR #62](https://github.com/tclare95/isHPPOpen/pull/62) (DynamoDB 365 days + S3 Standard indefinite). The separate idle `riverscraper` installation is tracked for later inventory as [#66](https://github.com/tclare95/isHPPOpen/issues/66).

## Non-goals

EA fetching, deployed Dynamo/S3 persistence, historical archives/backfill, web changes, production activation, migrating/retiring existing Lambdas, accessing/deleting old `riverscraper` state and introducing microservice orchestration.

## Release/rollback

Mergeable source scaffolding is separate from an authorised AWS release. Local and CI validation must work without AWS credentials. Deploy only to a separately identified **staging** account/environment after explicit approval; prod is a separate future manual approval. No existing consumer is switched, so rollback consists of disabling the new schedule without affecting the old system.
