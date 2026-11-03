# HPP status and transition events — acceptance work

All items are **unstarted**. They are product/evidence outcomes rather than a mandate for any specific class, table, queue or PR count.

- [ ] 1. Characterise the authoritative legacy threshold/input, known fallback sources, `openIndicator` transition history and fields consumed by `/api/hppstatus` and HPP alerts; include a small representative fixture set.
- [ ] 2. Verify the chosen RDP Colwick measure's identity, unit, datum, access and lag before allowing it to drive HPP decisions.
- [ ] 3. Prove threshold equality and opposite crossings, unchanged state, repeated/replayed readings, late corrections, source disagreement and missing/stale/unverified fallback behaviour without speculative events.
- [ ] 4. Prove carried-in status, long intervals without transitions, closure-window edges, invalid event timestamps, and historical continuity. Coordinate [#63](https://github.com/tclare95/isHPPOpen/issues/63).
- [ ] 5. Prove the existing public status contract and alert state/delivery behaviour continue through separate status-reader shadow, activation and rollback.
- [ ] 6. Capture shadow evidence with **zero** authoritative event writes, subscriber/delivery/progress changes and emails; define operator response to an unresolved state/history mismatch.
- [ ] 7. Document separately approved production activation, single-writer handoff and rollback gates. No live writes, source switches or deployments are authorised by this OpenSpec.

**Progress (3 November 2026, code only):** deterministic fixture evidence for 3 and 4 now covers a full shadow run (pure core #96 plus the shadow integration slice): threshold equality, holds on missing/stale/unverified/identity-mismatched/conflicting/unavailable evidence, replay and superseded readings, retry and overlap without duplicate transitions, legacy timestamps preserved, and carried-in 7/28/182/365-day parity with the public reader. Item 6's comparison and continuity report exists but has not run against production data. Items 1–7 remain open until the hosting, access and shadow evidence gates in [services/hpp-status/README.md](../../../services/hpp-status/README.md) are approved and met.

**Non-goals:** creating a generic engine, migrating gauge observations or building a second notification system.
