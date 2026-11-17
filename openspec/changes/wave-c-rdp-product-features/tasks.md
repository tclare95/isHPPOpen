# Wave C acceptance outcomes

## C1 — Historical comparisons
- [ ] A visitor can choose two observed high-water events and compare their supported Colwick level curves, highest observed readings, above-threshold time and relevant context.
- [ ] Links from the existing events explorer/details are clear; comparisons are shareable or otherwise recoverable.
- [ ] Gaps, provisional values, unobserved event boundaries and corrections remain visible instead of being converted to exact claims.
- [ ] Targeted tests cover differing durations, missing evidence and corrected/re-resolved event links.

## C2 — Rainfall with river levels
- [ ] An existing appropriate river/history view shows useful selected recent **observed** RDP rainfall alongside river-level history.
- [ ] Units, 15-minute interval/label convention, measurement identity, source freshness and missing periods are represented faithfully.
- [ ] Unverified intervals and missing rainfall are not converted into confidently timed or zero rainfall; forecast precipitation remains separate.
- [ ] Tests cover interval totals, partial accumulation windows, lag, units and provider errors.

## C3 — Current conditions
- [ ] An existing prominent page offers a concise, actionable conditions summary using authoritative HPP status, current observed level/trend, existing forecast and supported nearby-gauge context.
- [ ] Freshness, unknown and source disagreement are visible; prediction is not confused with current HPP access decisions.
- [ ] Links to the original specialist pages remain useful; mobile layout works.
- [ ] Focused tests cover source loading/error/staleness combinations and HPP authority.

## C4 — Outfall detail
- [ ] Visitors can open a focused view for one outfall from the existing CSO map/history and share or revisit that selection.
- [ ] Canonical identity, current status/freshness, recorded events and corrections, monitoring coverage and downstream route are shown when evidenced.
- [ ] Co-located monitors remain distinct; missing, unresolved, outside-membership or unavailable evidence is not misrepresented as clear.
- [ ] Relevant API/UI tests cover selected identity, links, unknown status and route unavailability.

## Delivery boundaries
- [ ] Workstreams reuse existing source/client contracts and avoid duplicate dashboards.
- [ ] Relevant tests, lint and build pass or limitations are explained.
- [ ] Record any genuine RDP producer API gap separately without inventing a new producer contract inside isHPPOpen.
