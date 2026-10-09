# Proposal: Lightweight on-demand integration deployment for river data platform

## Why

The merged [RDP foundation PR #1](https://github.com/tclare95/river-data-platform/pull/1) provides an inert .NET 10 Lambda and manual prepare/review/apply flow, but **no AWS stack has been deployed**. The earlier specifications risk suggesting a permanently running, full-scale staging mirror. That is unnecessary and potentially costly for a public environmental-data platform with explicit version-controlled selection.

## Decision

Use **local/CI fixtures for routine verification** and a **small, isolated, mostly idle integration stage** for targeted real AWS tests. It is an environment boundary, **not** a production-scale copy.

- Staging/test may use the **same approved AWS account** as production with different named stacks, IAM identities, Dynamo tables, S3 buckets/prefix permissions, configuration and logs. No direct staging writes to production or existing legacy resources; never share mutable canonical storage.
- Prefer DynamoDB on-demand, private S3, Lambda/EventBridge and bounded logs. No provisioned DB capacity, always-on VPC/NAT, RDS, duplicate years of history or permanent production-rate polling for testing.
- Default schedule **disabled**. Manually trigger collection or enable a deliberately time-bounded, reviewed test schedule with an explicit stop. Gauge tests use roughly 1–3 measures; CSO tests a few selected outfalls. Provider **catalogue discovery** may be complete without operationally polling every discovered asset.
- Use fixtures/fake clock for 365-day gauge and 24-month CSO cutovers; no two-year staging accumulation, full historical import or perpetual data growth. Test data may be cleaned by a documented **explicitly approved stage-only** operation, or left near-empty and idle. Retention and archive invariants are verified before any cleanup.
- Keep **production** architecture unchanged: gauge 365 days hot + canonical S3 Standard history indefinitely (ADR-001); CSO completed event hot retention 24 UTC calendar months after end + verified S3 history, open/unresolved events non-expiring; source revisions/provenance safeguarded.
- Existing production scraper, web, alert and predictor integrations stay untouched. No production cutover.

## Scope

1. Stage-A [#75](https://github.com/tclare95/isHPPOpen/issues/75): **separately approved** manual deployment of the *inert foundation only* to a small staging stack, with validated STS account/region, distinct IAM and release workflow, disabled EventBridge rule and logs-only Lambda permissions.
2. Stage-B [#75](https://github.com/tclare95/isHPPOpen/issues/75): **after [#49](https://github.com/tclare95/isHPPOpen/issues/49) and [#65](https://github.com/tclare95/isHPPOpen/issues/65)** and another explicit approval, smoke test a few configured EA measures through S3-first verified archival and Dynamo hot writes; record failure/replay, cost and safe disabled/idle end state.
3. Later bounded staging smoke tests for [#69](https://github.com/tclare95/isHPPOpen/issues/69) IAM read API and [#71](https://github.com/tclare95/isHPPOpen/issues/71)/[#72](https://github.com/tclare95/isHPPOpen/issues/72) CSO modules reuse the same stage infrastructure where appropriate without expanding to production-scale data.

## Affected repositories

- `tclare95/isHPPOpen`: canonical policy/OpenSpec changes and deployment issue #75.
- `tclare95/river-data-platform`: future implementation/deployment of stage config, IaC, tests, IAM, budget/observability and any RDP runbook adjustments.

## Non-goals

No AWS resource creation in this documentation change; no automatic PR/main deployment, shared writable stage/prod storage, wholesale production data clones, continuous staging collection, production TTL activation or changed legacy consumers. This policy does not prescribe a hard price or exact account number.

## Release gates

A code PR/merged OpenSpec **never grants cloud mutation approval**. AWS `prepare` itself uploads an artifact/creates a change set and requires explicit approval, followed by **separate approval** to `apply`. An operator verifies target, isolation, expected ongoing cost and schedule state. Disable on completion and verify cleanup scope before removing disposable test data. Existing RDP [deployment runbook](https://github.com/tclare95/river-data-platform/blob/main/docs/DEPLOYMENT.md) remains the baseline and should be updated by the implementation agent.
