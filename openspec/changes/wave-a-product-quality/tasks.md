# Delivery outcomes — Wave A product quality

These are lightweight acceptance tasks, not an orchestrator checklist or prescribed implementation order.

## CSO history
- [ ] Existing water-quality event history can navigate older records using real backend pagination/continuation rather than splitting one capped response.
- [ ] Filters, order, detail expansion, downstream route selection and incomplete-coverage messages remain coherent while paging.
- [ ] Focused tests cover pagination boundaries, large result sets, filters and changing/corrected events.

## Alerts
- [ ] Signup, confirmation and management clearly communicate alert triggers and current subscriptions.
- [ ] Users can reach existing subscription management and unsubscribe safely; failures and uncertainty are not presented as successful notification coverage.
- [ ] User-facing improvements and correctness fixes preserve delivery/threshold protections, with relevant tests.

## Presentation
- [ ] Main public routes share discoverable navigation and broadly consistent presentation, including responsive behaviour.
- [ ] Unnecessary explanatory/defensive copy is shortened without removing important safety, freshness or source context.
- [ ] Verify representative mobile/desktop layouts, accessibility and existing charts/maps/interactions.

## Parallel engineering fixes (no new OpenSpec required)
- [ ] Homepage uses authoritative HPP status semantics, including equality, missing/stale readings and non-fabricated loading values; tested.
- [ ] Admin routes enforce intentional authorization for authenticated non-admin users; tested and rollout configuration documented.

## Verification
- [ ] Relevant tests, lint and build pass or limitations are explained.
- [ ] Implementation PRs link this product baseline and any existing more-specific OpenSpecs they rely on.
