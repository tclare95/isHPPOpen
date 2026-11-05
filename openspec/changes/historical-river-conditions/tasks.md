# Historical river conditions — acceptance work (#104)

These are **outcomes** for independently reviewable implementation work, not a required class layout, database, algorithm or PR count. All unchecked; this documentation PR performs no runtime work.

## First usable slice: history explorer

- [ ] Confirm Colwick production history-read availability from the existing isHPPOpen server identity and characterise the returned quality/coverage data; record any permission or request-limit blocker without silently widening IAM.
- [ ] Present a selectable historical year/month and time-zoomed Colwick chart; ensure finite read/pagination bounds, clear source/units, honest gaps and distinct `no data` versus `read failed`.
- [ ] Test UTC/calendar-year and DST boundaries, out-of-order/duplicate/revised readings, pagination, expired cursors, and archive integrity failures without blanking live site status.

## Next: evidence-aware conditions and historical context

- [ ] Calculate/report supported time below versus at/above 2.2 m, with denominator, unknown time and historical-versus-operational-HPP wording; validate against small known threshold-crossing fixtures and missing intervals.
- [ ] Show an attributable Colwick seasonal median/range or percentile comparison for genuinely comparable historic periods. Withhold unsupported "normal"/"record" labels, handle provisional/edited observations, and show years contributing.
- [ ] Replace or explicitly retire the homepage's hard-coded yearly/monthly historical tables **after** reconciliation with the new derived figures; preserve legacy rolling transition-based status windows and HPP alerts.
- [ ] Exercise missing/partial coverage (`coverage.json=[]`), failed source, revised canonical history and inaccessible archives. Partial data must not be advertised as complete.

## Completion boundary

- [ ] Record source and coverage evidence, UI screenshots/fixtures, acceptance tests, deliberate non-goals, and operational impact in the implementation PR. No AWS deployment or production data write is included in this OpenSpec.

**Not required for the first release:** multi-gauge comparisons, new RDP analytics endpoints, rainfall, forecast scoring, or HPP transition replay. Those have independent owners.
