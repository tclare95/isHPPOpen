# OpenSpec planning for the isHPPOpen suite

This repository is the canonical OpenSpec planning home for isHPPOpen, its existing scraper/predictor and the implemented **unified .NET river data platform**. Runtime source, tests, CI and release procedures still belong to their respective repositories.

- `config.yaml` — default `spec-driven` workflow and suite constraints.
- `changes/<change-name>/` — proposed changes, each with a proposal, capability deltas, design and tracked tasks.
- `specs/<capability>/spec.md` — current requirements after changes are implemented and archived.

## Writing product-focused specifications

**OpenSpec describes the product behaviour and its acceptance criteria; it is not an implementation prescription.** Make the requirement clear enough to test while leaving the coding agent latitude to choose the simplest maintainable solution within existing architecture.

- **Proposal:** why the change matters, intended users/operators, scope, non-goals and compatibility impact.
- **Capability specs:** observable behaviour, rules, boundaries and failure cases written as testable WHEN/THEN scenarios. State *what must hold*, not the method used.
- **Design:** explain consequential trade-offs and constraints where they matter (e.g. security, correctness, data integrity, external contracts or an explicitly approved architectural choice). Distinguish firm decisions from illustrative implementation options.
- **Tasks:** small verifiable outcomes and tests, without prescribing code structure, exact PR decomposition or arbitrary tuning parameters. Put detailed implementation plans in the implementation work/PR when needed.

**Default:** do not mandate extra abstractions, database fields, classes, locks, queues, file paths, specific algorithms, or numbers of PRs merely because they are one plausible solution. Mention such details only when necessary to satisfy a real invariant, protect a contract, or preserve an agreed decision; briefly explain *why*. Reuse existing patterns and avoid speculative future-proofing.

**Review question:** Could a different, simpler implementation still satisfy the product requirement and pass the acceptance tests? If yes, the spec should normally allow it.

## Active proposals

**Implemented baseline:** [audit-web-engineering-standards](changes/archive/2026-10-08-audit-web-engineering-standards/proposal.md) is archived after implementation and Astra review. Its checked tasks record verification; [operational-health](specs/operational-health/spec.md) is now a current capability. Deferred findings remain in [the engineering backlog](../docs/ENGINEERING_BACKLOG.md).
- [improve-alert-scheduling](changes/improve-alert-scheduling/proposal.md) — evaluate a faster Vercel alert cadence **after** reliable idempotency, freshness and monitoring checks.
- [evaluate-data-storage](changes/evaluate-data-storage/proposal.md) — completed architecture decision: DynamoDB hot 365 days + S3 Standard permanent raw history ([ADR-001](../docs/decisions/0001-observation-storage.md)); documentation merge tracked in #48.
- [bootstrap-dotnet-observation-service](changes/bootstrap-dotnet-observation-service/proposal.md) — **implemented foundation in [RDP PR #1](https://github.com/tclare95/river-data-platform/pull/1)**: .NET 10 inert Lambda, CI, SAM manual deployment guardrails and distinct domain seams; foundation task evidence reconciled in [#64](https://github.com/tclare95/isHPPOpen/issues/64). Subsequent AWS operations have separate approval gates.
- [configurable-gauge-ingestion](changes/configurable-gauge-ingestion/proposal.md) — **implemented** EA registry/adapter, DynamoDB hot observations and ingestion health in RDP; three selected production measures are now collected on an approved schedule ([#49](https://github.com/tclare95/isHPPOpen/issues/49)).
- [archive-observation-history](changes/archive-observation-history/proposal.md) — **implemented** permanent private S3 archive, verified hot-store eligibility and direct historical reads ([#65](https://github.com/tclare95/isHPPOpen/issues/65)).
- [observation-read-api](changes/observation-read-api/proposal.md) — **implemented in [RDP PR #10](https://github.com/tclare95/river-data-platform/pull/10), deployed to staging and signed-smoke verified in [PR #16](https://github.com/tclare95/river-data-platform/pull/16)**, an independent .NET read Lambda, AWS_IAM, unified Dynamo/S3 history, gap/integrity semantics ([#69](https://github.com/tclare95/isHPPOpen/issues/69)).
- [cso-asset-catalogue-and-selection](changes/cso-asset-catalogue-and-selection/proposal.md) — separately bounded provider catalogue, reviewed explicit named ID sets, independent polling selection and no Sewage Map runtime dependency ([#71](https://github.com/tclare95/isHPPOpen/issues/71)).
- [modernise-cso-data](changes/modernise-cso-data/proposal.md) — CSO source evidence, current state, stable/revisioned spill events, two-year hot/S3 tiered history and authenticated CSO read API ([#72](https://github.com/tclare95/isHPPOpen/issues/72)).
- [production-observation-deployment](changes/production-observation-deployment/proposal.md) — **production rollout and remaining release gates** ([#81](https://github.com/tclare95/isHPPOpen/issues/81)): same-account stage-isolated IAM/storage and **live three-measure 15-minute EA collection**, monitoring and protected outage recovery. Production read API *code* merged, P6 activation still gated; P5 six-measure expansion and D7 TTL separately pending; no web cutover.
- [lightweight-integration-deployment](changes/lightweight-integration-deployment/proposal.md) — **low-cost stage / AWS deployment**, no continuously populated replica. Local/CI fixtures first; [#75](https://github.com/tclare95/isHPPOpen/issues/75) Stage A and bounded Stage B smoke completed with recorded evidence; stage is normally disabled.
- [hpp-site-status-and-transitions](changes/hpp-site-status-and-transitions/proposal.md) — **separate HPP service** consuming RDP Colwick observations, holding last-known status on stale evidence and preserving historical transition/closure semantics ([#89](https://github.com/tclare95/isHPPOpen/issues/89); umbrella #68). Planning only.
- [forecast-publication-contract](changes/forecast-publication-contract/proposal.md) — distinguish government-page and Python ML forecasts, keep current CSV/JSON/public contracts and plan an independently released legacy compatibility publisher ([#90](https://github.com/tclare95/isHPPOpen/issues/90); umbrella #68). Contract only.
- [River data platform direction](../docs/RIVER_DATA_PLATFORM_DIRECTION.md) — one modular backend with separate observation/CSO/forecast-publication/site-assessment semantics; Python model execution stays independent and observation ADR-001 remains gauge-specific.
- [migrate-observation-storage](changes/migrate-observation-storage/proposal.md) — historical snapshot reconstruction, **insert-if-absent only** backfill, durable provenance and gap reconciliation ([#50](https://github.com/tclare95/isHPPOpen/issues/50)).
- [expand-multi-gauge-support](changes/expand-multi-gauge-support/proposal.md) — register all **six** existing gauge series and prove configuration-only EA onboarding without coupling to isHPPOpen ([#52](https://github.com/tclare95/isHPPOpen/issues/52)).
- [investigate-predictor-rdp-observations](changes/investigate-predictor-rdp-observations/proposal.md) — bounded investigation of #53: canonical RDP observation coverage, incident freshness versus direct EA, safe fallback and leakage-free evaluation; Python, model and live sources unchanged.
- [unify-gauge-consumers](changes/unify-gauge-consumers/proposal.md) — server-only Vercel OIDC/SigV4 web client, independent source modes and safe migration **Trent → observed levels → gauge alerts** ([#51](https://github.com/tclare95/isHPPOpen/issues/51)).
- Future independent backlog: [RDP playground #77](https://github.com/tclare95/isHPPOpen/issues/77) and [public API/developer access #78](https://github.com/tclare95/isHPPOpen/issues/78). Neither is designed or exposed by these changes.
- Implementation dependency: #52 completes **six-series parity** before full #51 Trent cutover; #50 can run in parallel with #52 and supplies historical evidence without requiring complete multi-year recovery before web cutover. #51 switches **Trent → observed levels → gauge alerts** once #69 and verified recent history are available. CSO #71/#72 remain a separate lane. Old Node scraper and predictor remain untouched. A successor must not retire the Node schedule until HPP transitions, site water-quality/CSO work, and the public river snapshot have separately verified writers and consumer cutovers; see [retirement map](../docs/LEGACY_SCRAPER_RETIREMENT.md).

**Agent handoff:** [Current agent roadmap](../docs/OBSERVATION_BACKEND_HANDOFF.md) lists verified deployed state, P5/P6 release gates, the gauge consumer milestone, parallel CSO/HPP implementation, and Node-writer retirement dependencies.

Implementation task checkboxes are updated only against merged code and recorded evidence; **release gates, consumer source switches and deployments are separately tracked**. Writing or merging a specification does not authorise them.

## GitHub issue backlog

The suite's ideas backlog and work index is **[Issue #57](https://github.com/tclare95/isHPPOpen/issues/57)**. New ideas belong in **individual GitHub issues**, not a separate markdown backlog. Keep #57 updated with issue links, and link selected work to OpenSpec changes. Ideas for historical migration, web consumer migration, gauge expansion, predictor inputs, other providers, cache invalidation and React lint follow-up are captured there.


## Using the OpenSpec CLI

Install the current OpenSpec CLI locally following [OpenSpec's installation instructions](https://github.com/Fission-AI/OpenSpec). In the web repository, use `openspec list`, `openspec status --change <active-change-name>` and `openspec validate --all --strict` to inspect active work and current specs. Use the OpenSpec Codex integration generated by `openspec init` / `openspec update` in your local workspace; review any generated files before committing them. The engineering baseline was validated and archived with CLI 1.14.1; local Codex integration initialization remains optional and was not included in the implementation.

When implementing, work on the application change in a separate branch and PR. Do not mark tasks done in the documentation-only onboarding PR. Update tracked tasks as work is verified, and archive only after implementation and review.

Cross-repository changes are defined here with a shared descriptive change name. Link each affected repository's issues and implementation PRs to the canonical change. The scraper and predictor retain their own production deployment approvals; the web repository may deploy on main merge.
