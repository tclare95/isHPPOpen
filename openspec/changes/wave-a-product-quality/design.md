# Design considerations — Wave A product quality

This change deliberately **does not prescribe component structure, cursor encoding, page size, CSS framework or worktree/PR strategy**. Implementers should inspect current main and use the simplest solution satisfying the user journeys and existing API contracts.

## CSO history
A UI-only split of the current capped response would incorrectly suggest that older events are accessible. Use bounded server-backed traversal with stable event identity/order and honest coverage, while preserving the existing 48h/7d/30d filters and route selection. If RDP cannot support an efficient required query, document the minimum RDP contract gap and keep the website honest; do not bypass producer boundaries with unbounded reads.

## Alerts
Do not duplicate the existing scheduling/retry/idempotency OpenSpec. Subscription experience changes must not inadvertently alter trigger thresholds, re-arm behaviour, delivery identity or source-version rules. Keep reliable-source uncertainty visible, but avoid exposing personal data or internal system diagnostics.

## Design and copy
Extract useful conventions from both established core pages and newer explorer pages. Shared navigation/layout patterns should minimise divergence without making maps, charts and data-heavy views less useful. Main text should answer user questions; technical caveats belong close to affected information or in accessible detail/attribution sections, never deleted when essential to interpreting risk, freshness or uncertainty.

## Rollout
Web main merges may deploy automatically. Preserve existing public URLs and deep links; verify mobile and desktop views. No production side effects outside separately authorized web-code changes.
