# Proposal: Wave B product operations and subscriber control

## Why
isHPPOpen already provides alerts, an admin overview, event/banner editing and operational diagnostics. Wave B should make these existing facilities more useful, not introduce a second backend or rebuild completed pages.

This change documents **three new or extended product behaviours**. Routine copy cleanup and failure-mode fixes are engineering tasks against existing contracts, not new product capabilities.

## Product outcomes
- **Alert subscribers** can safely edit, pause and resume supported subscriptions, and understand the status of their notifications.
- **Administrators** can find operational problems and their next useful diagnostic action from one protected view, reusing evidence the application already records.
- **Editors** can find and manage past, current and future events reliably; event identity and the existing banner workflow remain predictable.

## Capability deltas
- `alert-subscription-controls` — subscriber-managed edit, pause/resume and clear status.
- `admin-operational-oversight` — actionable read-only operational overview using existing site diagnostics.
- `admin-editorial-management` — browse and safely manage all editorial events, preserving the existing banner tool.

## Existing specifications and boundaries
- Wave A `wave-a-product-quality` owns basic alert signup/management clarity, coherent public presentation, CSO history browsing and related correctness/security tasks. Build on its delivered code; do not duplicate it.
- `improve-alert-scheduling` owns evaluator safety, source freshness and notification deduplication. This change must preserve those invariants.
- `openspec/specs/operational-health/spec.md` defines the existing source-health response and timings. Extend, do not replace.
- RDP remains the authoritative source of observations, CSO and route evidence; isHPPOpen owns subscriber actions, HPP decisions, editorial operations and application presentation.

## Additional Wave B engineering work without new specs
- **Copy/content sweep:** remove needless justification and repeated technical prose after Wave A's design updates while preserving material uncertainty, source attribution and water-safety context.
- **Failure-mode resilience:** test and repair loading, empty, stale, partial-data, error and recovery states in the site's existing routes. No artificial zero readings or false all-clear states.

## Non-goals
No new notification channel/rule type, subscriber account system, generic RDP monitoring product, operational write controls, destructive data repair tools, CMS replacement, event data migration, broad interface rewrite or redefinition of HPP/source authority.

## Release/authorization
Product specifications do not authorize production changes. Existing admin authorization requirements apply to all new read paths. Protect subscription management tokens and personal information. No production alert messages, schedule/threshold changes, AWS/RDP changes or data mutations should be performed for tests.
