# Tasks: Unified .NET river data platform foundation (#64)

All tasks are **unchecked implementation work**. Documentation alignment is not implementation completion.

## 1. New repository and minimal runnable solution

- [ ] 1.1 Create fresh **`tclare95/river-data-platform`** repository (never `riverscraper` or an extra `river-observations` scaffold) when implementation is authorised; link canonical OpenSpec, [platform direction](../../../docs/RIVER_DATA_PLATFORM_DIRECTION.md) and [#64](https://github.com/tclare95/isHPPOpen/issues/64) in README/AGENTS.
- [ ] 1.2 Pin .NET 10 SDK; create small Core, Infrastructure, Lambda and Tests solution/projects with DI, options validation, structured logging, cancellation, fake clock, xUnit, sensible NuGet management and local runbook; defer unnecessary module projects.
- [ ] 1.3 Implement a non-collecting, disabled-by-default Lambda handler/composition root returning `Disabled` or `NotConfigured`; do not fetch EA, CSO, forecast data or touch any real persistence.
- [ ] 1.4 Test clean-checkout restore/build/test/format and disabled invocation; assert no outgoing HTTP/DB/S3 calls, actionable redacted config failure and proper cancellation.

## 2. Security, CI and release guardrails

- [ ] 2.1 Add stage-isolated AWS SAM template for a managed `dotnet10` Lambda, minimal CloudWatch logging/health hooks and an **inactive** EventBridge schedule; stage/prod resource separation, **eu-west-1 only as an approved provisional default**.
- [ ] 2.2 Add required PR CI for .NET restore/format/build/test, SAM validate and repeatable package checks, running without AWS credentials, and ensure main/PR never auto-applies an infrastructure change.
- [ ] 2.3 Document and verify manually dispatched **prepare → reviewed change set → explicitly approved apply**, checking STS AWS identity, expected stage/account/region, artifact provenance and fail-closed behaviour on a mismatch. No apply as part of the initial foundation PR.
- [ ] 2.4 Document least-privilege initial IAM (logs only), separate stage/prod identities and no production data credentials, rollback/disabled schedule and developer/release runbooks.

## 3. Reusable platform boundaries without premature implementation

- [ ] 3.1 Document shared source/provider identity, configuration, health and provenance conventions; draw clear boundaries for observation entities, CSO source/current/event records, independent model forecast publications and reproducible site assessments. **Do not create generic universal data/retention tables.**
- [ ] 3.2 Explain follow-on sequencing for [#49](https://github.com/tclare95/isHPPOpen/issues/49) → [#65](https://github.com/tclare95/isHPPOpen/issues/65) → [#69](https://github.com/tclare95/isHPPOpen/issues/69), separate historical/web [#50](https://github.com/tclare95/isHPPOpen/issues/50)/[#51](https://github.com/tclare95/isHPPOpen/issues/51), and parallel CSO [#71](https://github.com/tclare95/isHPPOpen/issues/71) → [#72](https://github.com/tclare95/isHPPOpen/issues/72). Preserve independent Python predictor execution.
- [ ] 3.3 Verify no modification to `isHPPOpen` application behaviour, `ishppopenScraper`, `trent-predictor`, existing AWS deployments, production data, alerts or legacy provider/public contracts.
- [ ] 3.4 Link tested source implementation PR and evidence to [#64](https://github.com/tclare95/isHPPOpen/issues/64); leave downstream tasks unchecked and do not mark #64 implemented on documentation PR merge.

## Acceptance

From a fresh clone, `dotnet test` and CI pass with no AWS credentials; an unconfigured scheduled handler reports an inert outcome; manual deployment identities fail closed; no merge can deploy or activate production; future gauge and CSO implementations can grow as **independent modules in the same repository**. No infrastructure deployment, source migration or consumer cutover is authorised by this change alone.
