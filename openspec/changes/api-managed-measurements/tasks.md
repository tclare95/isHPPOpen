# Implementation tasks: API-managed measurements (#101)

**Planning status:** specification/docs only. These tasks are **not implemented** and this change does not authorise AWS or runtime modifications. Keep each slice independently testable; the coding agent may combine/split PRs where simpler. Behaviour is defined by [spec](specs/api-managed-measurements/spec.md); [design](design.md) is non-normative guidance.

## 1. Effective-state contract and safe migration plan
- [ ] Define a single effective selection owner per environment, readable configuration version, missing/invalid/explicit-empty semantics, and an unchanged six-registered/three-selected baseline. Test snapshot validation, stage isolation and existing release-guard compatibility offline.
- [ ] Decide the minimal existing-store/role arrangement, safe actor identity, failure behaviour and exactly-once adoption of reviewed existing state. Prove code deployment cannot reset an operator selection; keep all runtime adoption flags off.

## 2. Operator API for already-registered collection selection — first useful release
- [ ] Offer restricted inspection and compare-and-change of the *selected registered IDs* in one environment. Reject unknown/unsupported/duplicate/over-budget IDs, stale versions, ordinary read-role writes and cross-stage attempts; test successful and failed changes with a durable audit.
- [ ] Have collector use one validated effective selection per run without widening IAM or exceeding provider work budgets. Test disabled/no-poll, preserved latest/archive/health/cursor, re-enable within lookback, and a held beyond-lookback case requiring existing #81-B2 recovery.
- [ ] Verify read-only/disabled stage smoke under an independently approved plan before any later live selection migration. Do not activate six production measures as a side effect.

## 3. Independent publication control
- [ ] Let authorised operators publish/unpublish registered IDs separately from selection, with version conflict and audit evidence. Test that unpublishing returns the existing unknown-like 404 before arbitrary storage access; collecting/uncollecting does not change visibility or erase history.
- [ ] Keep current server-only first-party read API contracts and isHPPOpen curated display/alert eligibility unchanged.

## 4. Provider lookup, validation and new registration — later capability
- [ ] Provide bounded read-only discovery/lookup and clear verification of exact provider measure identity, station association, parameter, unit, datum and expected interval for supported EA types. Fixtures cover ambiguous Church Wilne series and invalid or unsupported identities.
- [ ] Add authorised canonical registration with collision protection, provenance and audit. Test that a new supported measure starts **uncollected and unpublished**, cannot reuse an existing canonical/provider ID, and requires no station-specific collector code change.

## 5. Operator visibility, safety and separately approved rollout
- [ ] Show effective version/actor/change history, selected/published state, latest observation, collection health/cursor and truthful available coverage including gaps/unknowns; avoid conflating freshness with archive completeness.
- [ ] Extend offline release/IAM guards and runbooks for managed configuration, reviewed stage migration, production authorisation, conflict cases, config-store outage, bounded capacity, and audited rollback. Demonstrate that future code releases preserve API-managed selection.
- [ ] Record relevant RDP .NET build/test/format, Python release/IAM guard tests and SAM validation, plus reviewed stage evidence. Production data/access/schedule/configuration changes are **separate operator approvals**, not implementation-task checkboxes.

## Explicit exclusions
No new provider type, public API/UI, CSO/HPP coupling, generic workflow engine, event bus, auto-discovery polling, historical import, retention change or cursor reset. #52 continues to own six-series registration baseline; #81 continues to own production release gates; #50 owns backfill/coverage reconciliation.
