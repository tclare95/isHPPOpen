# Tasks: RDP production observation deployment (#81)

**Planning-only specification.** All tasks below are unchecked and belong to future implementation/release work; code PRs do **not** authorise any AWS action. Canonical spec lives in isHPPOpen, runtime/IaC PRs in `tclare95/river-data-platform`.

## PR A — Production isolation, storage and release safeguards
- [ ] A1. Extend `template.yaml` stage conditions/rules to support production **inert** foundation and independent observation storage, preserving staging 1–3 selection/disabled schedule and all account/region/resource guards. Default production flags off.
- [ ] A2. Refactor `Composition.cs` and `PlatformOptionsValidator` to derive validated stage-specific table/bucket identities rather than staging literals. Do not grant data access merely because `Stage=production`; require independently selected approved storage/collection flags.
- [ ] A3. Add an isolated production GitHub OIDC bootstrap (repository immutable subject, production environment, artifact bucket, exact CloudFormation/deploy roles, boundaries and stage-scoped SNS/budget/log resources). Reuse no legacy identity or Terraform state.
- [ ] A4. Extend `deploy/release.py` and GitHub prepare/apply inputs to permit explicit reviewed production storage/collection/API states while retaining immutable manifest, source SHA, template/hash, change-set fingerprint, target/account/region and fail-closed confirmation. Refuse to detach previously retained production storage on disable.
- [ ] A5. Run positive/negative IAM tests: stage ↔ prod reads/writes/API invoke, non-production source credentials, incorrect role/account/region, artifact bucket confusion, PassRole and permission-boundary removal. Run .NET restore/build/format/tests, Python guards and SAM lint.
- [ ] A6. Document P0–P2 manual setup, exact named resources, resource/retention audit and rollback procedure. **Do not bootstrap, prepare or apply production AWS in the implementation PR.**

## PR B — Explicit collection, scheduling, operations and recovery
- [ ] B1. Add explicit reviewed `productionMeasurementIds`, keep independent `stagingMeasurementIds` (1–3) and registered vs published vs selected distinctions; fail closed on empty/duplicate/unknown selections. Test unselected gauges stay dormant.
- [ ] B2. Add independently configurable, default-OFF `ScheduleEnabled` and `CollectorsEnabled` for production; test manual bounded invocation with scheduler disabled, schedule cannot turn on without production store, source selection and verified monitoring.
- [ ] B3. Validate 15-minute interval, one concurrent invocation and max-three per-measure work budgets with 3 and 6 measurement fixture runs; preserve archive-first, idempotent corrections, cursor monotonicity, concurrent retry and neighbour isolation.
- [ ] B4. Add production monitoring for missing enabled-run heartbeat, source observed-time freshness and sustained lag, archive/DB errors, `BackfillRequired`, Lambda/EventBridge failures, API health and cost. Configure disabled-state silence; test actual alert delivery and recovery through an **approved** destination in a later release.
- [ ] B5. Add bounded, operator-driven **dry-run → approve → repair → verify** runbook/commands for beyond-lookback outages; keep existing cursor unchanged until verified repair/coverage acknowledgement. Do not implement unbounded self-healing history.
- [ ] B6. Add explicit gap evidence/approval and guarded CAS cursor-resume operation scoped to one measurement and exact previous cursor. Tests include 6h overlap/48h lookback (~42h threshold), retry, partial archive/hot failure, unresolved conflict, irrecoverable gap, stale precondition and no canonical overwrite.
- [ ] B7. Document P3–P5 gated manual smoke, first three to six selection, alarm runbooks, rollback and production cost review. **No schedule enablement or live reads/writes in the code PR.**

## PR C — Production read API, retention verification and operational handoff
- [ ] C1. Add production-scoped API allocation bootstrap → exact API-ID IAM binding → activate, with separate Lambda read-only permissions/secret/ARN and explicit Vercel Production OIDC trust, denying Preview/cross-stage; four AWS_IAM GET routes only.
- [ ] C2. Extend reviewed release guardrails and tests for prod API on/off without collector or storage deletion; validate coverage/integrity failures, signed latest/history/health and negative route/role tests via fixtures and **later separately approved** live smoke.
- [ ] C3. Define explicit production TTL activation gate **after** durable history evidence; test only eligible observations expire, S3 manifests verified, hot/archive cutoff and 30-minute cursor + 31-minute safety overlap. Leave actual TTL disabled in code/release defaults.
- [ ] C4. Document P6/P7 production read smoke, alarms, bounded p95/cost sampling, retention recovery, incident contacts, Vercel OIDC handoff and independent #51 shadow/rollback plan.
- [ ] C5. Run .NET restore/build/test/format, Python IAM/release guards, SAM lint and reproducible package checks; attach code PR and negative-test evidence to #81. **No live AWS production apply or web consumer cutover.**

## Separate operator approvals and evidence (not automatically executed by these PRs)
- [ ] D1. Approve precise production AWS account/region, IAM bootstrap scope, budget/contact and P1 prepare/review/apply.
- [ ] D2. Approve P2 production storage prepare/review/apply, preserve Retain/PITR/versioning.
- [ ] D3. Approve P3 exact three-measure manual smoke invocation limits, report and disabled end state.
- [ ] D4. Approve P4 continuous schedule + destination after missing-run/freshness alarm checks.
- [ ] D5. Approve P5 six-measure selection and its cost/runtime evidence only after #52.
- [ ] D6. Approve P6 production read API allocation and activation releases, authorised production signer and negative IAM checks.
- [ ] D7. If desired, **separately** approve Dynamo TTL after archive verification; no expiry/deletion rollout implied here.
- [ ] D8. #51 owns later web shadow and per-consumer activation; #50 historic import and any cursor repairs have their own data-mutation approvals.

## Non-goals
No old Node/predictor/web refactoring, CSO source activation, public API, playground, automatic unbounded outage catch-up, unconditional cursor reset, original source history deletion or production AWS execution in this documentation change.
