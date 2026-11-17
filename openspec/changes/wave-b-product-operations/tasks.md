# Wave B acceptance outcomes

## Subscriber controls
- [ ] Existing alert subscribers can view, edit where supported, pause, resume and remove their own subscriptions via the established management mechanism.
- [ ] UI distinguishes active, paused, pending-confirmation and unavailable/unknown operational evidence appropriately.
- [ ] Editing and resuming do not create retroactive triggers or duplicate notifications, and preserve subscriber authorization/privacy.
- [ ] Relevant API/UI/evaluator tests cover changes, retries and invalid management links.

## Operational admin view
- [ ] Admin overview helps locate recent problems with existing HPP/forecast/CSO/alert/source processes, without simply repeating the basic health badges.
- [ ] States, timestamps and useful next diagnostic links are clear; missing diagnostics never appear as healthy.
- [ ] Read-only access is limited to administrators, with sensitive values redacted and focused tests.
- [ ] Routine load is bounded and reuses available evidence rather than generating expensive production queries.

## Editorial management
- [ ] Admins can find and edit past, current and future events without the existing upcoming-only view or arbitrary 99-item cap.
- [ ] Creating an event never accidentally edits a same-named existing event; editing is identity-based.
- [ ] The banner editor remains functional with correct scheduling, feedback and cache refresh.
- [ ] Appropriate API/service/UI tests cover filtering/list navigation, identity, date handling and permissions.

## Direct engineering tasks — no new specification
- [ ] Simplify repetitive or defensive public copy after Wave A, retaining important context.
- [ ] Improve representative loading, empty, stale, partial and failure/retry states without fabricating all-clear values.
- [ ] Run relevant tests, lint and build and record legitimate limits of local verification.
