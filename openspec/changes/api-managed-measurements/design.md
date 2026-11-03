# Design: API-managed gauge configuration (#101)

**Status:** proposal / implementation guidance, not the normative product contract. See [spec](specs/api-managed-measurements/spec.md). The goal is one small control-plane capability inside existing RDP, not a new service ecosystem.

## What exists today (repository review, 3 November 2026)

| Area | Actual baseline | Consequence for this change |
| --- | --- | --- |
| Registry | RDP Core \`Observations.cs\`: \`MeasurementRegistry\` loads deployment-bundled \`measurements.json\`, validates EA exact provider IDs and 15-minute level/flow units/datums, maximum 12 registered measurements; \`Published\` on each measure | Preserve canonical IDs and exact metadata; avoid two competing sources of truth once migrated |
| Selected measurements | \`stagingMeasurementIds\` and \`productionMeasurementIds\` are independent arrays, currently the same three (Colwick level, Shardlow level/flow). An empty array is rejected. Staging limit 3, production limit 6. | Selection can be first mutating API capability. Explicit empty must be newly supported in the managed mode, not treated as absent legacy config |
| Collector | \`ObservationCollector\` selects by runtime stage, max three concurrent measures, 70s/measure plus health budget, archive-first durable writes, stage-specific cursor, overlap and lookback; held \`BackfillRequired\` on excessive cursor gap | Read a trustworthy effective selection before starting work; never reset cursor on disable/re-enable; keep work budgets |
| Reader | \`ReadService\` publishes only \`PublishedMeasurements\`; GET catalogue/latest/history/health; unpublished and unknown IDs both return 404. Read composition loads the same registry and has no collector/source | Keep ordinary first-party reads exactly scoped to published IDs; do not give read role write rights |
| Release | \`deploy/release.py\` validates bounded non-empty file selections, emits stage selection + SHA-256 of registry in \`release.json\`, and apply checks the reviewed hash against checkout/change set | Introduce an explicit managed-config release/migration contract. Do not let subsequent code releases reinstall the bundled list over operator choices |
| Isolation | Separate stage/prod stacks, storage, OIDC trust, role policies and manual prepare/apply. Reader is AWS_IAM and currently GET-only with exact first-party Vercel caller roles. Stage schedule is normally disabled. | Control mutations require separate operator authorisation and write scope; never add mutating actions to the current reader principal |
| History and coverage | Dynamo latest/cursor/health and archive-first S3 evidence; read API history has coverage inventory from reviewed \`coverage.json\`. #81-B2 controls recovery after long gaps; #50 owns historical imports. | An operator view may compose existing evidence; a last row does not imply uninterrupted coverage. Never use a config write to repair a cursor |

Baseline references: [RDP Observations.cs](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Core/Observations.cs), [measurements.json](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Infrastructure/measurements.json), [collector](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.Core/ObservationCollector.cs), [read service](https://github.com/tclare95/river-data-platform/blob/main/src/RiverDataPlatform.ReadApi/ReadService.cs), [release guards](https://github.com/tclare95/river-data-platform/blob/main/deploy/release.py), [production runbook](https://github.com/tclare95/river-data-platform/blob/main/docs/PRODUCTION.md), [onboarding evidence](https://github.com/tclare95/river-data-platform/blob/main/docs/GAUGE-ONBOARDING.md), and existing [#52 OpenSpec](../expand-multi-gauge-support/proposal.md).

## Simplest viable shape

**Recommended:** one **versioned effective configuration document/snapshot per environment**, owned by RDP, whose registered identities, selected collection IDs and published IDs are separate fields. Start with fixed, already-registered identities and selection changes only. Build a small operator API and a thin trusted-config reader for the collector; use existing stage-scoped security, data services, metrics and manual deployment practices.

No separate workflow backend, event streaming, event bus, review/approval database or continuously running sync component is justified. A validated authenticated mutation *is* the operator's explicit approval; higher-risk production activation can continue to require a distinct existing release/ops gate.

**Potential storage implementation, not a requirement:** a small strongly consistent, versioned config record in the environment's existing Dynamo table with conditional writes; a durable change/audit record can live alongside it, preferably atomically. This reuses a proven per-environment store and compare-and-swap patterns, rather than creating another database. An ETag-protected versioned S3 object or other small existing stage-isolated store could also meet the requirements if update atomicity, audit consistency, IAM and reader freshness are demonstrated. Do not make AWS service selection a product requirement. Do not use the observation archive prefix or alter archival retention semantics for configuration.

**Read consistency:** the collector must resolve a validated effective config before each run (a single coherent version for that run). A warm Lambda's old in-memory registry must not silently override a later operator disable. Read API publication should use the equivalent current environment snapshot without widening its storage access. If the current effective state cannot be trusted or validated, fail closed and raise observable diagnostics; do not revert to the embedded six-series defaults. An in-flight run already started with a validated version need not be forcibly interrupted; disable applies to subsequent runs. Limit the scope of any caching to preserve this guarantee.

**Operator control principal:** keep stage and production roles/scopes distinct. Implement the smallest separately protected operator route/host or isolated administrative entry point justified by AWS IAM; ordinary Vercel first-party reader role gets no configuration writes, no ability to assume an operator role, and no access to another environment. Reuse existing runtime conventions rather than exposing the collector Lambda directly. A public-browser console is not required.

## Illustrative API surface (NOT normative)

Exact routes, input formats and HTTP errors belong to implementation review. A plausible minimal split:

| Phase | Operator action | Illustrative route/semantics |
| --- | --- | --- |
| First | Inspect effective registered/selected/published state, version, change provenance | \`GET /operator/v1/measurements/configuration\` |
| First | Select/deselect **registered** canonical IDs | \`PUT /operator/v1/measurements/collection\` with explicit full selection and expected version/If-Match |
| Next | Publish/unpublish for private readers | \`PUT /operator/v1/measurements/publication\` with expected version |
| Later | Bounded upstream lookup and validation | \`GET /operator/v1/providers/{provider}/measurements/{providerMeasureId}\`, read-only |
| Later | Register validated source measurement under a stable ID | \`POST /operator/v1/measurements\`, starts unselected/unpublished |
| Later | Inspect recent changes and operational status | \`GET /operator/v1/measurements/changes\` and a per-measure overview |

A target environment must come from authenticated deployment/role scope, not from a freely writable stage field. Use simple predictable conflict errors (e.g. HTTP 409 or precondition failure), safe validation responses, and a stable applied version. A full-document update is easier to reason about than many overlapping toggle flags; ensure publication edits cannot accidentally erase a concurrent selection edit. Unchanged idempotent retries should not produce conflicting new effective states. Prevent unbounded payloads, list sizes, queries and provider lookups.

**Discovery later:** start with Environment Agency measurements already supported by the collector. Verify exact upstream measure reference, station association, parameter, unit, datum, interval and current source metadata against bounded read-only evidence. Do not select by station name or parameter alone (Church Wilne exposes multiple level series). Reject unsupported intervals or semantics rather than adding a universal provider plugin framework. Preserve original identity/provenance evidence. Never reassign a canonical ID after data exists.

**Health/coverage later:** reuse existing health, latest and history/coverage evidence and distinguish never collected, paused, stale, held for recovery, unknown historical coverage, and proven archive integrity. Do not derive coverage completeness from row counts or a latest sample; #50's reviewed coverage publication remains separate. Do not expose internals or storage keys to ordinary first-party readers.

## Conflict, safety, and audit

- Require an expected effective version for every mutation; reject stale edits rather than last-writer-wins. Preserve the entire prior config on validation or persistence failure.
- Validate referenced registered IDs, exact upstream metadata (before adding new ones), per-stage workload budget and existing provider limits before a version becomes effective. Do not permit an unsupported ID to reach the fetch path.
- Record actor identity (authorised principal), stage, UTC time, prior/new version, requested effective delta and outcome. A durable accepted-change audit must not claim success for a failed config commit. Redact credentials, untrusted upstream bodies and sensitive user data.
- Track both effective selection size and projected per-run/source request demand. Existing code's six-production/three-stage ceiling and three-way concurrency are a starting bound, not permission for automatic larger workloads. Budget increases are separate engineering/release reviews.
- Do not automatically reset/reseed a cursor on re-enable. A disabled measurement retains latest, health and its historical archive; subsequent staleness is visible. If it exceeds normal lookback, use existing #81-B2 operator recovery or clearly hold collection.

## Migration and release choices

**Before code activation:** leave the bundled registry, three-measure production selection, read publication and #81 manual prepare/apply unchanged. New operator endpoints should be inert/no-write until separately approved; a code merge does not authorise initial mutable-config adoption or P5 expansion.

**Migration option A (recommended):** after tests and approval, seed each stage's managed snapshot **once** from its reviewed deployed registry/selection/publication; compare against the *actual* approved effective collection state, sign off its version and activate managed reads for that stage. Seed stage and production independently. Do not seed all six into production collection. If an unexpected difference is found, stop and obtain review; do not guess or overwrite either state.

**Migration option B:** keep version-controlled registration definitions for an interim period while moving only environment selection to the managed snapshot. This is the smallest first implementation, provided the effective state has exactly one authoritative selection owner, validated registered IDs, and an unambiguous eventual registration migration. Recommended for first slice when it avoids premature registry editing APIs.

**Release safeguards:** update \`release.py\` and its guard tests as part of a future implementation before managed production activation. The current file-selection SHA and release manifest cannot remain the final authority after API writes. A release must identify effective config origin/version, validate that a code rollout will not implicitly replace it, and reject drift/unsafe modifications. Keep stage-specific account/role/OIDC review, independent manual prepare/apply and separate collection/schedule/data gates. Existing code may still ship a baseline fixture for validation, but it is not a silent fallback.

**Rollback:** an operator may audit and reapply an earlier validated selection/publication as a *new* version; temporarily disable collection without deleting source history; or, during an approved early migration failure, use a separately reviewed safe fallback to the previously captured exact effective state. There must be no automatic reversion to stale file defaults, no mass re-enable, no cursor reset and no data deletion.

## Suggested acceptance evidence

Use fixture/clock-controlled tests for all three axes and exact source identities; denied reader and cross-stage writes; two editors using a stale version; deliberately empty versus missing config; provider metadata mismatch; selected measure outside the workload budget; stale warm invocation; config-store outage fail-closed; retained data/cursor on disable; held lookback on re-enable; release drift and staged adoption. Verify integration only in the tiny approved staging setup first. Production IAM mutation, migration, AWS prepare/apply, selection change or live provider probing each needs a separate operator-authorised task.
