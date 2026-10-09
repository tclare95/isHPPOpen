# OpenSpec planning for the isHPPOpen suite

This repository is the canonical OpenSpec planning home for isHPPOpen, its existing scraper/predictor and the planned **unified .NET river data platform**. Runtime source, tests, CI and release procedures still belong to their respective repositories.

- `config.yaml` — default `spec-driven` workflow and suite constraints.
- `changes/<change-name>/` — proposed changes, each with a proposal, capability deltas, design and tracked tasks.
- `specs/<capability>/spec.md` — current requirements after changes are implemented and archived.

## Active proposals

**Implemented baseline:** [audit-web-engineering-standards](changes/archive/2026-10-08-audit-web-engineering-standards/proposal.md) is archived after implementation and Astra review. Its checked tasks record verification; [operational-health](specs/operational-health/spec.md) is now a current capability. Deferred findings remain in [the engineering backlog](../docs/ENGINEERING_BACKLOG.md).
- [improve-alert-scheduling](changes/improve-alert-scheduling/proposal.md) — evaluate a faster Vercel alert cadence **after** reliable idempotency, freshness and monitoring checks.
- [evaluate-data-storage](changes/evaluate-data-storage/proposal.md) — completed architecture decision: DynamoDB hot 365 days + S3 Standard permanent raw history ([ADR-001](../docs/decisions/0001-observation-storage.md)); documentation merge tracked in #48.
- [bootstrap-dotnet-observation-service](changes/bootstrap-dotnet-observation-service/proposal.md) — **implemented foundation in [RDP PR #1](https://github.com/tclare95/river-data-platform/pull/1)**: .NET 10 inert Lambda, CI, SAM manual deployment guardrails and distinct domain seams; canonical task closeout still tracked in [#64](https://github.com/tclare95/isHPPOpen/issues/64). No AWS deployment from foundation merge.
- [configurable-gauge-ingestion](changes/configurable-gauge-ingestion/proposal.md) — **second slice**, EA registry/adapter, DynamoDB hot observations and ingestion health in the **new .NET service**, staging/shadow only ([#49](https://github.com/tclare95/isHPPOpen/issues/49)).
- [archive-observation-history](changes/archive-observation-history/proposal.md) — **third slice**, private permanent S3 archive, verified expiry and direct historical reads ([#65](https://github.com/tclare95/isHPPOpen/issues/65)).
- [observation-read-api](changes/observation-read-api/proposal.md) — **fourth slice**, an independent .NET read Lambda, AWS_IAM + Vercel OIDC, unified Dynamo/S3 history, gap/integrity semantics ([#69](https://github.com/tclare95/isHPPOpen/issues/69)).
- [cso-asset-catalogue-and-selection](changes/cso-asset-catalogue-and-selection/proposal.md) — separately bounded provider catalogue, reviewed explicit named ID sets, independent polling selection and no Sewage Map runtime dependency ([#71](https://github.com/tclare95/isHPPOpen/issues/71)).
- [modernise-cso-data](changes/modernise-cso-data/proposal.md) — CSO source evidence, current state, stable/revisioned spill events, two-year hot/S3 tiered history and authenticated CSO read API ([#72](https://github.com/tclare95/isHPPOpen/issues/72)).
- [lightweight-integration-deployment](changes/lightweight-integration-deployment/proposal.md) — **low-cost stage / AWS deployment**, no continuously populated replica. Local/CI fixtures first; [#75](https://github.com/tclare95/isHPPOpen/issues/75) Stage A manually approved inert foundation deployment may start now, Stage B tiny live EA source smoke only after #49+#65.
- [River data platform direction](../docs/RIVER_DATA_PLATFORM_DIRECTION.md) — one modular backend with separate observation/CSO/forecast-publication/site-assessment semantics; Python model execution stays independent and observation ADR-001 remains gauge-specific.
- After the gauge ingest/archive/read path: [#50](https://github.com/tclare95/isHPPOpen/issues/50) historical backfill and [#51](https://github.com/tclare95/isHPPOpen/issues/51) Next.js consumer migration, in order **Trent → observed levels → gauge alerts**. CSO #71 can proceed alongside gauge implementation after #64, followed by #72. The read API can be implemented before #50 finishes; production web cutover needs validated history/coverage. Existing Node scraper and predictor remain untouched throughout initial backend build.

**Agent handoff:** [Current agent roadmap](../docs/OBSERVATION_BACKEND_HANDOFF.md) links the merged foundation, small-stage deployment gates, gauge vertical slice and parallel CSO work.

All implementation tasks are initially unchecked. Writing a specification is not implementation approval or deployment.

## GitHub issue backlog

The suite's ideas backlog and work index is **[Issue #57](https://github.com/tclare95/isHPPOpen/issues/57)**. New ideas belong in **individual GitHub issues**, not a separate markdown backlog. Keep #57 updated with issue links, and link selected work to OpenSpec changes. Ideas for historical migration, web consumer migration, gauge expansion, predictor inputs, other providers, cache invalidation and React lint follow-up are captured there.


## Using the OpenSpec CLI

Install the current OpenSpec CLI locally following [OpenSpec's installation instructions](https://github.com/Fission-AI/OpenSpec). In the web repository, use `openspec list`, `openspec status --change <active-change-name>` and `openspec validate --all --strict` to inspect active work and current specs. Use the OpenSpec Codex integration generated by `openspec init` / `openspec update` in your local workspace; review any generated files before committing them. The engineering baseline was validated and archived with CLI 1.14.1; local Codex integration initialization remains optional and was not included in the implementation.

When implementing, work on the application change in a separate branch and PR. Do not mark tasks done in the documentation-only onboarding PR. Update tracked tasks as work is verified, and archive only after implementation and review.

Cross-repository changes are defined here with a shared descriptive change name. Link each affected repository's issues and implementation PRs to the canonical change. The scraper and predictor retain their own production deployment approvals; the web repository may deploy on main merge.
