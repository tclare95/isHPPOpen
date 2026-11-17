# Wave B design considerations

Keep this design intentionally lightweight. Implementation agents may choose the simplest maintainable solution compatible with the existing repository patterns.

## Subscription changes
Use the existing email-scoped management link/token model. Treat edits as controlled rule changes rather than covertly changing subscriber thresholds. Any changed threshold or alert type must re-baseline safely, without replaying old notifications or creating duplicates. Pausing must stop future evaluations for that subscription; resuming must use current evidence rather than issuing notifications for conditions missed while paused. Avoid implying that the site can guarantee freshness or delivery.

## Operations overview
The existing `/api/admin/operational-health` and administrator overview already expose source checks. Add actionable context from existing HPP, forecast, gauge-alert, CSO and water-quality operational records where available, avoiding expensive fresh scans on every page render. Distinguish confirmed healthy, degraded, unavailable and *not checked*. Expose no subscriber email addresses, signed tokens, provider credentials or internal secret values. A separate read-only operational diagnostics endpoint is acceptable if simpler than expanding the existing health contract; do not break the contract already in use.

## Editorial management
Public `/api/events` is upcoming-events oriented; it must remain compatible. A separate authorized admin read may be preferable to changing the semantics of the public route. Event updates should target stable ID, with create always creating a new event rather than matching and overwriting by name. Keep existing banner scheduling/editing, cache invalidation and authentication checks. Avoid broad data/schema migration.

## Integration
Wave A's shared navigation and access-control changes may overlap with these pages. Implement on current main and coordinate conflicting files. Design/copy and failure-mode sweeps should build on, rather than redo, Wave A. Release web-only changes through normal reviews; backend or production configuration actions remain separately approved.
