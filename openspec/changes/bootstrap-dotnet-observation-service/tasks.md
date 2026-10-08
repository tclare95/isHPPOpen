# Tasks: .NET observation collector foundation

## 1. New repo/solution (no AWS deployment)

- [ ] 1.1 Create **new** `river-observations` repo when authorised; link this OpenSpec change in README/AGENTS instructions and #64. Do not overwrite old `riverscraper`.
- [ ] 1.2 Add pinned .NET 10 SDK, solution/project layout (Core, Infrastructure, Lambda, Tests), NuGet version management where helpful, `.gitignore` and a concise local runbook.
- [ ] 1.3 Add minimal managed Lambda entry point, host dependency injection/options validation, cancellation/clock/logging and explicit no-op result until configured. No source calls or data writes.
- [ ] 1.4 Add xUnit tests for startup, invalid configuration, no-op scheduling, cancellation and run diagnostics; run restore/build/test/format locally.

## 2. Safe, isolated infrastructure and CI

- [ ] 2.1 Define an isolated AWS SAM template and stage-specific parameters for eu-west-1, Lambda/runtime, disabled-by-default EventBridge schedule and limited CloudWatch logs; leave Dynamo/S3 resource creation to following changes.
- [ ] 2.2 Add PR CI: restore/build/test, format check, SAM template validation and package verification; failures block merge. No PR/main auto-apply or deployment side effect.
- [ ] 2.3 Add explicit manual prepare/review/apply workflow design with STS account+region assertions and environment approval, documenting intended AWS account **without embedding account IDs/secrets in public logs or examples**. Abort on mismatch.
- [ ] 2.4 Document stage/prod isolation, artifact identity, minimum IAM, planned alarms, rollback by disabling new schedule and build/release instructions.

## 3. Cross-repo boundaries and handoff

- [ ] 3.1 Verify the legacy `ishppopenScraper`, web and predictor are untouched; do not connect new Lambda to production consumer outputs.
- [ ] 3.2 Document extension seams for EA provider/measurement registry (#49) and permanent S3 archive (#65), plus dependency order for #50/#51.
- [ ] 3.3 Attach CI evidence and source implementation PR to [#64](https://github.com/tclare95/isHPPOpen/issues/64). **Do not activate a schedule, deploy or mutate resources as part of this task without separate explicit approval.**

## Acceptance

A developer can clone and `dotnet test` the new repo; PR CI passes; the IAM/account/schedule rules prevent accidental old-account use or production deployment. The runtime is deliberately non-collecting until #49.
