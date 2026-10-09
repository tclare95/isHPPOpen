# River data platform — agent implementation and deployment roadmap

## Current baseline (9 October 2026)

The `tclare95/river-data-platform` private repository **exists**. Its [foundation PR #1](https://github.com/tclare95/river-data-platform/pull/1) was merged: pinned .NET 10, small Core/Infrastructure/Lambda/Tests, disabled/no-op Lambda, credential-free CI, SAM lint and two-stage manually reviewed AWS release guardrails. **No live AWS prepare/apply or provider collection is reported by the foundation PR/runbook.** Link the implementation evidence into the canonical [#64](https://github.com/tclare95/isHPPOpen/issues/64) OpenSpec task tracking rather than rebuilding the foundation.

See [platform direction](RIVER_DATA_PLATFORM_DIRECTION.md), [foundation OpenSpec](../openspec/changes/bootstrap-dotnet-observation-service/proposal.md), [RDP modules](https://github.com/tclare95/river-data-platform/blob/main/docs/MODULES.md) and [RDP manual deployment runbook](https://github.com/tclare95/river-data-platform/blob/main/docs/DEPLOYMENT.md).

For the **gauge domain only**, [ADR-001](decisions/0001-observation-storage.md) accepts 365 days of full-resolution Dynamo hot readings plus indefinite private S3 Standard history with manifest-based direct GetObject reads. **CSO** has its separate 24-calendar-month-after-completion hot event policy. Python predictor execution and existing public/Node/Atlas/S3 consumer contracts remain unchanged.

## Low-cost staging versus production: accepted policy

[Lightweight integration deployment OpenSpec](../openspec/changes/lightweight-integration-deployment/proposal.md) and [deployment task #75](https://github.com/tclare95/isHPPOpen/issues/75) establish:

- **Local/CI first:** fixture, clock, adapter/contract, archive/correction and failure-path tests normally use no AWS credentials.
- **Integration stage:** tiny isolated stack, on-demand Dynamo and private S3 with **near-empty data**, ideally 1–3 selected EA measurements and only a few configured CSO outfalls. Source polling and EventBridge are disabled by default; collection is invoked manually or temporarily time-bounded by explicit approval. No complete production historical import, permanent 15-minute duplicate polling, permanent large API consumers or always-on database/VPC/NAT.
- **Production:** separate IAM, writable tables/buckets, config, collection schedules, consumer controls and authentic canonical histories. **Same account is allowed** if IAM/resources remain isolated. Never give staging writable production data access.
- **No shortened shared retention semantics:** use fake clocks + synthetic historical stage objects to test 365-day gauge and 24-month CSO boundaries. Cleanup of tagged **disposable stage test data** is separately approved and narrowly scoped (e.g. after 7–30 days), not a short automatic Dynamo TTL or archive-deletion lifecycle in production/domain code. Leave stage disabled and nearly empty between tests.
- **AWS applies remain manual and separately approved**, including staging. A PR/issue does not authorise role setup, prepare, apply, collection activation or deletion.

## Recommended agent execution order

| Order | Work | Tracking | Scope and acceptance |
| --- | --- | --- | --- |
| 0 | Record foundation implementation evidence | [#64](https://github.com/tclare95/isHPPOpen/issues/64) / [RDP PR #1](https://github.com/tclare95/river-data-platform/pull/1) | Mark only independently verified foundation tasks complete, archive if appropriate; no new scaffold |
| A | **Minimal inert integration deployment** | [#75](https://github.com/tclare95/isHPPOpen/issues/75), Stage A | Can run independently **when AWS account/region and operator approve**. Manual prepare/review/apply, Disabled Lambda, log-only IAM, EventBridge disabled, no Dynamo/S3 data resources needed |
| 1 | **Configured EA measurement ingestion** | [#49](https://github.com/tclare95/isHPPOpen/issues/49) | Registry, normalisation, incremental EA adapter, Dynamo hot/latest and run health; fixture-first, 1–3-measure staging allowlist; no production collection |
| 2 | **Verified S3 observation archive** | [#65](https://github.com/tclare95/isHPPOpen/issues/65) | Immutable private S3+manifests, archive-first persistence, replay, safe TTL eligibility, bounded historical reader; no production TTL |
| B | **Tiny real-data integration smoke** | [#75](https://github.com/tclare95/isHPPOpen/issues/75), Stage B | **After #49+#65 and another operator approval**; stage-only Dynamo/S3, a few manual EA polls, archive→Dynamo parity, replay, health/metrics, cost and disable state |
| 3 | **Authenticated observation read API** | [#69](https://github.com/tclare95/isHPPOpen/issues/69) | Separate read Lambda, AWS_IAM + Vercel OIDC/SigV4 trust, unified Dynamo/S3 GETs, coverage and integrity/error semantics; compact stage fixtures suffice |
| 4 | **Historical gauge reconstruction** | [#50](https://github.com/tclare95/isHPPOpen/issues/50) | Approved historical evidence inventory/import, dedup and source coverage; **no full stage clone**; no automatic production migration |
| 5 | **Staged web consumer transition** | [#51](https://github.com/tclare95/isHPPOpen/issues/51) | Vercel server-to-server IAM/OIDC, bounded shadow comparisons and reversible flags: Trent → observed levels → gauge alerts |

### Parallel CSO lane

After #64, [#71](https://github.com/tclare95/isHPPOpen/issues/71) catalogue + **explicit named collection sets** can run alongside #49, assuming agents isolate domain files and coordinate shared SAM/host files. Stage may discover **all** Severn Trent metadata while polling **only a few selected assets** on demand. After #71, [#72](https://github.com/tclare95/isHPPOpen/issues/72) develops source claims, status, stable event IDs/corrections, separate 24-month event hot/S3 and internal CSO read endpoints. Follow-up stage smoke reuses #75's lightweight environment. Historical EDM/Mongo/Glacier reconciliation, hydrological upstream relationships, site assessments, forecasts/publication and legacy scraper retirement remain later separate changes.

**Do not run #49 and #65 in separate agents simultaneously against their shared Dynamo writer/archive transaction code.** Likewise, assign one owner to shared SAM/IAM/host edits at a time. Parallel domain work should use separate branches/worktrees and agree contracts before touching shared infrastructure. #69 can begin after #49's identity and #65's archive reader contracts have stabilised, even before the full historical backfill.

## Short agent prompts

**#64 documentation closeout**: "Review merged `tclare95/river-data-platform` PR #1, its `docs/IMPLEMENTATION.md` and the canonical `bootstrap-dotnet-observation-service` task list. Update only verified completed task checkboxes/evidence in isHPPOpen, link the PR and mark/archive the implemented change if OpenSpec conventions permit. No product code or AWS apply."

**#75 Stage A (operator approval required)**: "Follow `lightweight-integration-deployment` and the RDP `docs/DEPLOYMENT.md`. Prepare a minimal inert staging deployment checklist, resource/IAM isolation and cost limits. **Do not call AWS prepare/apply or create identities until I explicitly approve the account, region and actions.** After authorisation, manually prepare/review/apply the foundation only, invoke Disabled and record the disabled end state."

**#49**: "Implement `openspec/changes/configurable-gauge-ingestion` from isHPPOpen in merged `tclare95/river-data-platform`, following gauge ADR-001 and #75's small-stage rules. Provide version-controlled EA measure config, bounded provider adapter, conditional Dynamo hot/latest and per-measurement health; ensure stage test set can be 1–3 measures and schedules default disabled. Fixture/unit tests first, no S3 archive (#65), no AWS apply or legacy changes. Open a bounded implementation PR."

**#65**: "Implement `archive-observation-history` after #49 writer contracts in river-data-platform: S3 immutable verified archive/manifests **before** Dynamo hot writes/TTL, correction/replay, read-range and failure tests. Prove 365-day cutover using fake time/small fixtures, no full staging historical clone, no auto archive deletion. No AWS apply, production TTL or consumer cutover. Open a PR."

**#69**: "Implement `observation-read-api` after archive/query contracts stabilise. Add read-only stage-isolated .NET Lambda and explicit AWS_IAM GET routes with Vercel OIDC/SigV4 trust, bound unified hot/archive reads and cover honest historical gaps versus expected archive corruption. Test with compact stage-only Dynamo/S3 fixtures, not production history; no web migration or AWS apply. Open a PR."

**#71**: "Implement `cso-asset-catalogue-and-selection` in river-data-platform, independent of gauge persistence. Discover Severn Trent assets with verified pagination/IDs, deterministic versioned configured named outfall selection and unresolved-ID health. Complete catalogue discovery does not imply full-source polling. Stage uses a handful of explicit IDs with schedule disabled; no runtime Sewage Map, AWS apply or existing scraper changes. Open a PR."

**#72**: "Implement `modernise-cso-data` after #71 selection contract, reusing shared API/archive conventions. Keep provider source claims, current freshness and stable spill events/revisions separate; uphold 24-month completed-event hot storage and S3 verified history. Test with synthetic old events and a few stage-only outfalls; no full stage data replica, live rollout or legacy cutover. Open a PR."

## Operational release gates

- Account and eu-west-1 target must be explicitly approved and checked with STS before **each** AWS prepare/review/apply; `riverscraper` and legacy AWS resources are off limits.
- Budget/cost alert, restricted log retention and disabled schedules are verified in stage before activating source collection.
- Test data must be isolated from production even in a shared AWS account. Verify stage role denial of prod data operations. No stage-writer role should be usable from public/Preview web paths.
- Archive-first integrity and S3 Standard read availability are prerequisites to **approved production observation collection**. Production canonical data retention remains as accepted; stage cleanup cannot silently change it.
- Do not switch off `ishppopenScraper` when gauge ingestion exists: HPP, CSO, forecasts, water-quality and alerts have independent dependencies ([#68](https://github.com/tclare95/isHPPOpen/issues/68)). Production migration and legacy shutdown need separate approval and reversible release gates.
