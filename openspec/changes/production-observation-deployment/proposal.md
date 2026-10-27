# Proposal: RDP production observation deployment and operational readiness

## Why
The `river-data-platform` EA collector, archive-first Dynamo/S3 persistence and AWS_IAM read API have been built and exercised in a small, isolated staging environment ([#75](https://github.com/tclare95/isHPPOpen/issues/75), [#69](https://github.com/tclare95/isHPPOpen/issues/69)). Staging API smoke passed 13/13 signed checks in [RDP PR #16](https://github.com/tclare95/river-data-platform/pull/16). It has not proven real Vercel Preview federation, representative continuous collection or a production release.

The existing RDP SAM template, bootstrap and runtime deliberately prohibit production storage/API/collection; EventBridge scheduling is hard-disabled and the collector uses a staging-only measurement allowlist and resource names. A production-ready implementation requires explicit new controls, rather than merely disabling those safeguards.

## Owner decisions (27 October 2026)
1. **Account/region:** use the already approved staging AWS account, `eu-west-1`, with separate production CloudFormation stacks, deployment identities, IAM boundaries, artifacts, DynamoDB/S3 resources, API, cursor secret, monitoring and budget. Do not reuse legacy `riverscraper`, Node scraper or predictor infrastructure.
2. **Activation:** deployment of application code never implicitly creates/activates a production collector. Use manual `prepare → inspect → separately authorise apply`, immutable source/artifact/change-set verification, and separately approved deployment/collection/read/schedule/TTL gates. Production defaults disabled, staging remains mostly idle.
3. **Sources:** initial controlled production smoke uses three already tested EA measurements (Colwick level, Shardlow level and flow). Full six-measurement activation depends on [#52](https://github.com/tclare95/isHPPOpen/issues/52) source identity/registry work. Production collection selection is version controlled and separate from staging and catalogue publication.
4. **Running mode:** 15-minute EventBridge cadence, at most one collector Lambda invocation concurrently, bounded per-measure concurrency and work budgets. Schedule enablement is independent of the runtime collector flag and resource existence. A selected source failure does not stop healthy peers.
5. **Retention:** on-demand encrypted DynamoDB, PITR and 365-day hot observations, plus indefinite private versioned S3 Standard canonical archive; continue archive-first verification. DynamoDB TTL remains disabled at first production activation and has a **separate** evidence/approval gate.
6. **Alerting:** monitor missing scheduled runs, true observed-time freshness, source/ingest/archive failures, `BackfillRequired`, API health/errors and costs; operational alerts must have a tested destination and disabled-state suppression.
7. **Recovery:** normal collector overlap/lookback retries recover automatically **while inside the configured safe lookback**. Beyond that, emit `BackfillRequired`, preserve the durable cursor, isolate the affected measurement and require a bounded operator-approved catch-up. If evidence cannot be recovered, record/approve the specific gap **before** a separate guarded cursor-resumption action. Never silently skip or overwrite existing canonical readings.
8. **Consumer:** production platform/data activation is **not** the same as #51 web cutover. isHPPOpen retains existing sources, forecasts/HPP/alerts and rollback until its own shadow-evidence decision.

## Capabilities
### New
- `production-observation-deployment`: isolated production lifecycle, restricted continuous collection, validated first-party read access, monitoring, fail-closed outage recovery and independent release gates.

## Owners and dependencies
**Canonical OpenSpec and tracking:** `tclare95/isHPPOpen` [issue #81](https://github.com/tclare95/isHPPOpen/issues/81). **Runtime/IaC/release/tests:** `tclare95/river-data-platform`. Reuse [ADR-001](../../../docs/decisions/0001-observation-storage.md), #49/#65 collector/archive, #69 authenticated API, [#75](../lightweight-integration-deployment/proposal.md) staging evidence, #52 six-gauge catalogue, #50 protected historical import and #51 reversible consumer integration. RDP production may begin controlled three-measure collection before #52 completes, but cannot claim six-series web readiness until #52 and #51 gates pass.

## Non-goals
No changes to legacy Node scraper, Mongo, web alert delivery, predictor or public isHPPOpen API; no #50 historical reconstruction, #52 onboarding implementation, #51 web code or cutover, CSO production rollout, public developer API (#78), playground (#77), automatic long-outage catch-up service, replication of production history into staging or re-evaluation of retention. No new RDS/ECS/NAT/VPC/control plane.

## Release and rollback
**This PR and issue are specification only and grant no AWS approval.** Future code PRs are also not production authorisation. Independently approved production phases provision inert infrastructure, add durable storage, perform bounded manual collection, enable continuous polling, expand to six, expose an IAM read API and hand off to the web. Safe stop disables schedule and collector while **retaining** storage/archive/cursors, independent of stopping the old scraper. IAM/production API rollback must not delete canonical data or reuse staging credentials. Each production gate requires precise operator approval and verified rollback evidence.
