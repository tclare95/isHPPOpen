# Investigation and acceptance evidence — #53

All items unstarted. Completing the **documentation** is not proof of a live or shadow test.

- [ ] **1. Identity/coverage matrix:** list all four live level and six observed-rainfall dependencies, exact provider measure references, compatible RDP identities or missing support, unit/datum/interval/quality, latest/history availability and any hard blockers. Include forecast-rain vintage as a separate input.
- [ ] **2. Contract fixture review:** compare bounded, UTC RDP history/latest/health responses with direct EA examples, including pagination, empty/unknown coverage, source lag, historical gaps, duplicate timestamps, corrections and provider failures. Record expected feature parity and explicit non-parity. No private production fetch without read-only approval.
- [ ] **3. Temporal audit:** trace existing training, inference and backtest feature derivation, especially 7-day lags, 15-minute resampling/fill, observed future rain, random split, time/target alignment and late revisions. Document which tests can genuinely replay as-known-at and which can only compare hindsight values; no training or model edits.
- [ ] **4. Incident freshness evidence:** define and, only under separate authorisation, collect paired RDP/direct-EA age and request-latency traces across normal periods and representative rising/high-water, delayed-collector, missing-sample and partial-failure cases. Include max/p95 lag by required series, forecast-anchor displacement, forecast-run success and chosen source; agree the minimum acceptable tolerance from the current direct-EA baseline before selecting a source.
- [ ] **5. Security/cost feasibility:** review a minimal read-only eu-west-2 predictor caller against eu-west-1 existing RDP production read API, IAM route guard, signed request, bounded retries and timeout budget; estimate read cost/requests without changing AWS.
- [ ] **6. Recommendation and gates:** record go/conditional-go/no-go and explicit prerequisites (rainfall support, missing production selection, proof of equivalent units, historical-as-known-at limitations, demonstrated lag/availability, controlled fallback). Identify later independently approved predictor shadow/cutover/rollback changes and any separate RDP registry/IAM work.
- [ ] **7. Forecast boundary handoff:** link #90 as the product contract; document optional future RDP model-independent publication/query work without binding it to #53's observation source migration or current S3 CSV users.

### Acceptance to start *subsequent* implementation

A reviewed evidence report SHALL show: (a) verified identity and adequate availability for **all required** inputs, (b) no demonstrated regression in incident-source freshness or forecast feature equivalence against direct EA, (c) bounded and observable fallback/unavailability decisions, (d) accurately labelled time-ordered versus hindsight replay results, (e) a least-privilege cross-region caller option, and (f) a reversible, separately authorised shadow/cutover plan. Unknowns are blockers or explicit conditional decisions, not silent pass marks.

**Not authorised:** production/source changes, model retraining, AWS/IAM writes, production historical queries, forecast publish, deployment or schedule updates.
