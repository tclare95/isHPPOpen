# Tasks: Lightweight integration deployment (#75)

The tasks are future actions. **No AWS prepare/apply, account choice, identity provisioning, cloud deletion or production mutation is approved by this documentation PR.**

## Stage A — minimal, inert foundation deployment (can start now with explicit approval)

- [ ] A1. Record approved AWS account/region and exact stage resource inventory; document expected idle cost, selected AWS cost alert/budget, stage names and no reuse of legacy/prod roles, data stores or Terraform state.
- [ ] A2. Configure new **staging-only** GitHub OIDC trust, deployment roles and private artifact bucket using the approved RDP runbook; test that wrongly scoped STS identity, environment or resource name is rejected.
- [ ] A3. After explicit approval for cloud prepare, dispatch RDP **Prepare deployment**, inspect immutable artifact/hash and full unexecuted SAM change set, verify the schedule is DISABLED and runtime permissions logs-only, then obtain separate explicit apply approval.
- [ ] A4. Execute only the reviewed stage change set through manually confirmed Apply; verify CloudFormation completion, no collector/provider/storage access and controlled Lambda `Disabled` smoke result with structured diagnostics.
- [ ] A5. Record evidence/rollback in [#75](https://github.com/tclare95/isHPPOpen/issues/75); leave schedule disabled and near-zero idle data footprint. **No production deployment.**

## Stage B — small real-data integration (depends on #49 and #65)

- [ ] B1. Configure separate stage on-demand DynamoDB + private S3, stage-only IAM, tagged disposable resources, bounded logs/requests and **1–3 configured EA measures**, no imported year of history or always-on collection.
- [ ] B2. Following another approved prepare/review/apply, invoke bounded source collection manually and verify archive-first S3 claims/manifests/checksums, Dynamo conditional writes/latest, cursor, health, correction and idempotent replay.
- [ ] B3. Exercise 365-day cutoff/archive reader with compact synthetic older records and fake-time tests; verify source coverage vs expected archive corruption without storing 365 actual days in stage. No shortcuts to archive-before-expiry rules.
- [ ] B4. End in DISABLED/idle state; capture request/write counts, CloudWatch/log costs, source limits, alarms, isolation check and observed/estimated spend.
- [ ] B5. Where useful, explicitly approve **stage-only** 7–30-day test-fixture cleanup or leave a nearly empty stage. Do not install generic short Dynamo TTL or canonical S3 archive deletion lifecycle, and never touch production/legacy data.

## Follow-on smoke checkpoints, not baseline full replicas

- [ ] C1. Reuse small stage for #69 signed observation API reads and wrong-stage denial when its backend routes are implemented.
- [ ] C2. Reuse small stage for #71 catalogue validation and #72 synthetic CSO event history/revision tests when those modules are implemented; selected operational poll IDs remain few.
- [ ] C3. Update RDP deployment runbook and evidence/issue links with the minimal-stage assumptions, budget/disable/cleanup rules. Do not mark any staged feature active in production without a **separately approved** release.

No required always-on background checks, second populated historical archive or duplicated production infrastructure. Do not close #75 after Stage A alone if Stage B remains outstanding.
