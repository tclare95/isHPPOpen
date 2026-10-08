# New observation backend — implementation handoff

## Decision and repository ownership

[ADR-001](decisions/0001-observation-storage.md) accepts **DynamoDB on-demand + private S3 Standard**, 365 days of full-resolution hot readings and **indefinite S3 raw observations**, queryable historically by bounded direct `GetObject`. Environment Agency first, measurement identity separate from station, gauge configuration in version control and no admin UI.

Implement the **new standalone `tclare95/river-observations` .NET 10 AWS Lambda backend**. It has **not yet been created by these specs**. `tclare95/riverscraper` is a legacy experimental deployment, possibly in another AWS account; do not import its Terraform state or reuse its resources. No work in the old Node.js `ishppopenScraper` Lambdas is required for this backend. Legacy HPP/CSO/forecast functions and production API/S3 keys remain live. Their eventual modular replacement and old scraper retirement are separate, tracked as [#68](https://github.com/tclare95/isHPPOpen/issues/68), not assumed complete when gauge collection migrates.

## Recommended agent execution order

| Order | OpenSpec change | Tracking issue | What code changes in the new repo | Completion boundary |
| --- | --- | --- | --- | --- |
| 1 | [bootstrap-dotnet-observation-service](../openspec/changes/bootstrap-dotnet-observation-service/proposal.md) | [#64](https://github.com/tclare95/isHPPOpen/issues/64) | .NET 10 host, DI/CI/tests, AWS SAM scaffolding, stage/account assertions and manual prepare/apply | Running tests and CI; no active polling or production changes |
| 2 | [configurable-gauge-ingestion](../openspec/changes/configurable-gauge-ingestion/proposal.md) | [#49](https://github.com/tclare95/isHPPOpen/issues/49) | Versioned EA registry/adapter, incremental coordinator, staging Dynamo hot writes/latest and health | Staging/shadow only; **no production activation or TTL** before #65 |
| 3 | [archive-observation-history](../openspec/changes/archive-observation-history/proposal.md) | [#65](https://github.com/tclare95/isHPPOpen/issues/65) | S3 immutable chunks/compaction, verified manifests, safe TTL eligibility and bounded direct GetObject history | Tests cover corrections, manifest races, replay and archive-before-expiry |
| 4 | [observation-read-api](../openspec/changes/observation-read-api/proposal.md) | [#69](https://github.com/tclare95/isHPPOpen/issues/69) | Separate read-only .NET Lambda and IAM HTTP API, batch latest, unified Dynamo/S3 history and coverage/gap/error contract | No Next.js integration/production authorisation; contract/security/fixture tests |
| 5 | Historical reconstruction/backfill — [#50](https://github.com/tclare95/isHPPOpen/issues/50) | #50 | Approved read-only inventory; restore available Mongo/S3 source history into new canonical store | Explicit counts/coverage/parity evidence and separately approved migrations |
| 6 | Web consumers — [#51](https://github.com/tclare95/isHPPOpen/issues/51) | #51 | New API adapters in web and bounded Dynamo/S3 historical reads | Existing responses/alerts/fallbacks unchanged until independently signed-off cutover |

**Repo discipline:** Each agent receives **one OpenSpec change plus the ADR** and should submit one bounded implementation PR against the appropriate code repository. Do not run #49 and #65 concurrently against shared data model/persistence files. The central OpenSpec tasks may be checked off only when corresponding code, fixtures, verification and links to implementation PRs exist. Close/merge planning PRs independently of deployed releases.

### Short prompts to copy into coding agents

**Foundation (#64):** "Implement `openspec/changes/bootstrap-dotnet-observation-service` from `tclare95/isHPPOpen` in the new `river-observations` repo. Follow ADR-001, keep the collector disabled and preserve existing AWS environments. Build tests/CI and a manual release-only pipeline. No infrastructure apply or legacy repo changes. Update linked OpenSpec tasks with verified evidence and open a PR."

**EA ingestion (#49):** "Implement `openspec/changes/configurable-gauge-ingestion` in `river-observations`, using #64's foundation and ADR-001. Implement EA measurement config, incremental provider adapter, health and Dynamo 365-day hot-store keys. Do not enable prod collection or Dynamo TTL; preserve old scraper and public S3/Mongo contracts. Run tests, link #49 and open a PR."

**S3 archive (#65):** "Implement `openspec/changes/archive-observation-history` in `river-observations`. Produce private permanent S3 Standard raw archive, integrity/coverage manifests, crash/replay/correction handling, direct GetObject range reader and safe hot-expiry rules. Do not backfill, delete existing history, deploy prod or change web consumers. Run tests, link #65 and open a PR."

**Read API (#69):** "Implement `openspec/changes/observation-read-api` in `river-observations` as a separate read-only .NET Lambda. Follow its `api-contract.md`, accepted ADR-001, AWS_IAM/SigV4 and per-environment Vercel OIDC trust, unified Dynamo/S3 history, explicit known/unknown historical gaps and strict error for missing expected archives. Keep existing Next.js routes and all legacy Lambdas unchanged. Write contract/security/failure tests, no cloud apply, and open a bounded PR referencing #69."

**Important order:** #69 may begin once #49's data identity and #65's archive read contracts are stable; it need not wait for the full production backfill in #50. Consumer cutover (#51) needs validated source parity/coverage. If #50 finds uncollected legacy intervals, produce coverage metadata so #69 can distinguish them from broken expected S3 archives.

## Operational prerequisites (not design blockers)

- Confirm intended **AWS account and eu-west-1** target before any new stack creation; require owner approval and STS identity checks. `riverscraper` Terraform state/old account is **not** the starting point. Investigate retirement separately in [#66](https://github.com/tclare95/isHPPOpen/issues/66).
- Backend CI build/test/validate is always safe and should not deploy. Any deployment, schedule activation, database read/modify, retained-data cleanup or secret update requires separate explicit authorisation.
- Preview/staging and production table, bucket, IAM and web credentials must not overlap; no production alert sends from new collector and no hidden switch in existing web endpoints.
- Atlas is currently Free tier; do not claim live sizes without an approved read-only inventory during #50. Use modest AWS budgets and alarms rather than requiring a standalone performance prototype.
- Do not switch off the old mixed-concern `ishppopenScraper` merely because gauge readings are available through Dynamo/S3. Its remaining HPP, water-quality/CSO and forecast-publication responsibilities require [independent future replacement #68](https://github.com/tclare95/isHPPOpen/issues/68).
