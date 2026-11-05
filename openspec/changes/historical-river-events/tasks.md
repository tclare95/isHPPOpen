# Historical high-water events — acceptance work (#105)

All tasks are unstarted. They specify **observable outcomes**, leaving implementation choices and exact work decomposition to the coding agent.

## Colwick first release

- [ ] Confirm available Colwick historical read and quality/coverage semantics, reuse the historical-conditions page's authenticated bounded reading behaviour, and document a modest event-identification rule at the 2.2 m reference.
- [ ] Show a discoverable list of supported past high-water periods with a navigable event detail chart and correct source, timestamp, unit, peak and supported threshold-duration labels.
- [ ] Test event start/end across month/year edges; missing data before/within/after an event; no proven end; simultaneous or revised readings; query/pagination and archive failures; and provider quality corrections.
- [ ] Verify that event lists and detail pages distinguish observed threshold evidence from authoritative HPP closure/alert history and never send notifications or mutate `openIndicator`.
- [ ] Record incomplete event semantics and any necessary caveats from real imported history, including the January 2024 example only when its actual readings can be inspected.

## Later independently gated multi-gauge extension

- [ ] Confirm each additional series has actually been imported and is queryable with reviewed measure identity/datum/quality; document any unavailable comparisons without guessing.
- [ ] Add a comprehensible comparative view with independently labelled levels or appropriate normalisation and descriptive historical timing only, never a predictive travel-time or flood-hazard promise.
- [ ] Exercise a fixture with different station datums, a missing comparator and non-matching observation times to prove no invented equivalence or interpolation.

## Completion boundary

- [ ] Provide fixtures/tests and evidence of bounded read behaviour, data limitations and no change to live website status, alerts, collection or forecast sources.

**No initial dependency** on rainfall, RDP public API, new archive writes or any new event database.
