# Proposal: Wave A website product quality

## Why
isHPPOpen now has substantial HPP, river history, water-quality and RDP-backed functionality. The immediate product opportunity is to make existing capabilities easier to understand and use, rather than add another dashboard or rework the platform.

This change provides a **small, high-level behavioural baseline** for three user-facing improvements where product choices matter: CSO history browsing, alert subscription clarity, and coherent site presentation.

## Product outcomes
- Visitors can browse CSO event history beyond the first returned batch, with useful filtering and honest coverage.
- Subscribers understand what alerts they have requested and what can prevent timely delivery; they can review and stop subscriptions through existing management flows.
- Public pages feel like one website, with navigable, readable layouts and concise, useful content.

## Capability deltas
- `cso-history-browsing` — add navigable, coverage-aware event history to the existing water-quality page.
- `alert-subscription-experience` — clarify the existing signup, confirmation, management and alert information journey.
- `site-presentation` — consistent navigation, visual hierarchy and information-first copy.

## Scope and boundaries
These are **isHPPOpen consumer/product requirements**. Reuse its existing RDP client, CSO map/event history, alerting, homepage and historical explorer. Do not recreate those features. RDP remains the producer of canonical observations, CSO event/coverage evidence and network information.

The contemporaneous Wave A engineering fixes for **homepage status/level correctness** and **admin authorization** are correctness/security tasks, not new product capabilities. Address them directly with focused tests and existing HPP/Auth0 contracts; do not invent extra OpenSpecs unless a genuine unresolved product-contract conflict is discovered.

Alert evaluation reliability is already covered by `openspec/changes/improve-alert-scheduling`, and RDP CSO-source semantics by `openspec/changes/rdp-cso-water-quality-consumer`. This proposal does not replace either.

## Non-goals and release
No new dashboard, new alert channel or category, alert threshold recalibration, automatic live emails, CSO provider/backfill changes, RDP deployment, HPP writer/threshold changes, admin product redesign, or wholesale UI framework rewrite.

Requirements are independent enough to implement and release separately. A documentation PR does not approve production configuration, cron or source-authority changes.
