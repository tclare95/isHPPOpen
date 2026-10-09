# Design: A small, safe, test-on-demand environment

## Three practical environments, not two full platforms

| Mode | Purpose | Data and compute | Authorisation |
| --- | --- | --- | --- |
| Local/CI | Most unit/contract/failure/replay/retention tests | Fixtures, fakes and mocked AWS | Normal PR CI; no AWS credentials |
| Integration (stage) | Exercise actual IAM/SAM, source adapters, Dynamo/S3 durability, health | Separate nearly empty tables/buckets, selected 1–3 gauges / a few CSOs, manually invoked or temporarily scheduled, bounded logs | Explicit environment, AWS account, change set and invocation approvals |
| Production | Canonical continuously collected configured environmental data | Own IAM, tables/buckets, monitoring and retention, approved collection rates | Distinct reviewed manual production rollout |

**Same AWS account allowed**, if chosen. Isolation means independent least-privilege roles, named stacks, tables and buckets / strictly isolated writable S3 prefixes where safe, configuration, alert destinations and stage-bound API Gateway/Vercel OIDC trust. It does **not** require separate accounts or identical resource capacities. Initially prefer separate test buckets to minimise policy complexity.

## Stage configuration and lifecycle

- Stage/provider configs carry explicit stage, source allowlist, collection enable flag, maximum selected asset count, test-run duration/request ceilings, cost tags, and per-provider polling caps. Production values must never be inferred from stage.
- Catalogue discovery does not turn on polling for an entire provider. The CSO catalogue may contain all Severn Trent assets; stage operational collection still polls only explicit small test sets.
- No continuously enabled EventBridge schedule in staging by default, no always-on RDS/NAT/VPC infrastructure; use the existing no-op host until a domain-specific collector is implemented and separately reviewed.
- Stage Dynamo is on-demand; no pre-loaded full history. Stage S3 is private. Logs use bounded retention. Record expected resource count and spend guardrails, including a small AWS budget / cost alert where supported.
- No unsupported promise of a precise fixed staging cost: on-demand storage/request/CloudWatch/transfer charges still accrue. Confirm target account and check the actual bill/usage after an integration run.

## Retention and cleanup without invalidating domain invariants

**Production semantics do not change**:

- Gauges: immutable verified archive before Dynamo writes/TTL eligibility, `observedAt + 365 days` hot expiry, permanent canonical S3 Standard history. No archive lifecycle deletion.
- CSOs: source claims/event revisions preserved, completed event hot eligibility only `endedAt + 24 UTC calendar months` after archive verification; open or unresolved events have no TTL.
- Stage **functional tests must exercise those same rules**, using fake clock, historic fixture timestamps and selected test-only records. A stage environment need not hold 365 days of real readings or two years of live spills.
- **Stage test data cleanup is a separate operational policy**, NOT a shorter hot TTL in shared domain code, NOT a production-like S3 lifecycle rule and NOT permission to delete unverified archives as part of an ingestion run. If approved, target explicitly tagged disposable stage-only objects and test tables, show planned deletions, confirm account/stage and retain coverage/evidence needed for the test until verification has been recorded.
- Prefer avoid automatic destruction in v1; plan stage-only manual cleanup of disposable test runs after 7–30 days, or leave a tiny idle store. Deletion of S3 object versions/non-empty CloudFormation-managed buckets needs explicit operator approval, no wildcard across production resources. Canonical production archives and legacy history are never in the scope.

## Deployment steps and smoke phases

### Stage A: inert foundation (now; no data resources needed)

1. Operator records approved AWS account, region (provisionally eu-west-1), intended stage cost/resources and whether same-account stage isolation is used.
2. Configure per-stage GitHub OIDC trust and deployment resources in accordance with RDP's manual deployment runbook; do not reuse old `riverscraper` accounts/roles/state.
3. **After authorisation**, manually prepare the foundation change set; inspect template, package hash, IAM, CloudWatch and disabled schedule; obtain a second explicit apply approval and apply.
4. Invoke only the inert Lambda as a controlled smoke. Confirm `Disabled`, stage/account/region guardrails, log-only role, logs/alarms, no upstream/provider, Dynamo/S3 or legacy access. Leave schedule off.
5. Record SHA, stack resource inventory, test result, expected/observed cost and rollback reference in issue #75.

### Stage B: narrow end-to-end observation persistence (after #49 + #65)

1. Review fresh changes to IAM, Dynamo/S3 resources and stage collection configuration; select **1–3 real EA measures**, not all production sources.
2. Approved manual prepare/review/apply to staging. With EventBridge normally disabled, invoke a handful of runs and validate `fetch → S3 immutable write → verify/commit manifest → Dynamo conditional writes/latest → durable cursor`.
3. Re-invoke same samples for idempotency; prove a source correction, a storage failure/replay path and health metrics. Check stage IAM cannot read/write production resources.
4. Stop test collection, verify schedule disabled, cost/limits/alarms, and leave a near-empty stage or conduct explicitly approved stage-only cleanup.
5. Do not turn on production collection or change isHPPOpen web/alerts as part of this check.

### Later API/CSO verification

- [#69](https://github.com/tclare95/isHPPOpen/issues/69): signed IAM GET routes, wrong-stage denial, bounded Dynamo/S3 history, archive corruption and authenticated cursor tests on small archived fixtures.
- [#71](https://github.com/tclare95/isHPPOpen/issues/71)/[#72](https://github.com/tclare95/isHPPOpen/issues/72): provider discovery + tiny configured poll sets, event state/corrections and historical synthetic fixtures.
- [#50](https://github.com/tclare95/isHPPOpen/issues/50) historical inventory and [#51](https://github.com/tclare95/isHPPOpen/issues/51) consumer cutover do not need full staging history replicas; use representative approved fixtures and shadow comparisons against the existing production consumer **without granting staging write to production**.

## Required evidence and stop conditions

Review log records: targeted AWS account/stage/region, commit/artifact provenance, approved change set, schedule enabled/disabled state, stage resource names, selected source IDs, number of requests/results, manifest integrity, retries, run latency, approximate stage cost, alarm/health output and rollback/cleanup choice.

If stage credentials can mutate production data, provider configs unexpectedly poll all assets, archive integrity fails, unexpected always-on resource appears, or budget guardrails are missing, **stop and fix before further deployment or activation**.

Retain approved manual prepare/apply. This OpenSpec is not itself an authorisation to create AWS roles, buckets, change sets or database tables.
