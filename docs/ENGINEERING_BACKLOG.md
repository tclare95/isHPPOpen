# Web engineering follow-ups

Audit for [#46](https://github.com/tclare95/isHPPOpen/issues/46), 8 October 2026.
Only the web repository changed. No cache semantics, source/storage contracts,
cron schedules, framework versions or production configuration changed.

These findings already have separate issues; use those rather than duplicate them.
Priorities below order investigation, not permission to change production behavior.

| Priority / issue | Evidence and impact | Bounded next action |
| --- | --- | --- |
| P2: [Caching and invalidation #55](https://github.com/tclare95/isHPPOpen/issues/55) | `app/page.js` caches events/banner for six hours with `unstable_cache`; `libs/cache/revalidate.js:9` calls single-argument `revalidateTag` from event/banner writes. Current Next.js docs describe `use cache` as the replacement for `unstable_cache` and deprecate single-argument invalidation. Changing to stale-while-revalidate could delay admin edits. | Specify immediate read-after-write versus background refresh first. Add real cache-boundary tests for both event and banner edits, then change one primitive in a separate PR. Do not enable Cache Components incidentally. |
| P2: [Hooks lint enforcement #56](https://github.com/tclare95/isHPPOpen/issues/56) | Four `react-hooks/set-state-in-effect` reports: `components/functional/chart.js:55`, `forecastChart.js:190`, `stabilityChart.js:13` build derived chart state; `eventstable.js:39` repairs selection after refreshed/deleted events. These add renders, but naive removal changes chart “Now” timestamps or admin selection. | Handle chart derivation and event selection separately; cover data changes, empty inputs, timestamp behavior and selected-event deletion before enabling the rule. |
| P2: [Render purity #56](https://github.com/tclare95/isHPPOpen/issues/56) | One `react-hooks/purity` report at `components/layout/frontpage/header.js:26`: render reads `Date.now()` to enforce banner scheduling. Scheduling is visible product behavior, and existing `__tests__/header.test.js` fixes the clock. | Decide how scheduling reevaluates across hydration and start/end boundaries; add boundary checks before removing the render-time clock or enabling the rule. |
| P3: [Anonymous test mocks #56](https://github.com/tclare95/isHPPOpen/issues/56) | Eighteen `react/display-name` reports occur only in mocks across `chartrender`, `csoChart`, `csoMap`, `opentitle`, `topcontent` and `waterQualityPage` tests. Example: `__tests__/chartrender.test.js:4`. Application code has no violations. | The rule is now enforced in application code with a test-only exception. Name test doubles when editing those tests if useful for diagnostics; no bulk rewrite is required. |
| P3: [Consumer consolidation #51](https://github.com/tclare95/isHPPOpen/issues/51) | `libs/services/colwickAlertsService.js` combines gauge/status/water-quality conditions, persistence and delivery orchestration in compact functions; `runColwickAlerts` reads five distinct sources. `levelsService.js` reads scraper S3 JSON, while `trentWeirsService.js` reads EA directly. A generic rewrite risks freshness, units and transition/idempotency behavior. | Wait for the observation-store/measurement-identity decisions identified in #51. Characterize source fallback, thresholds and duplicate-delivery behavior before extracting one reader at a time; preserve public API envelopes and existing interfaces. |

The audit temporarily enabled all four rules using ESLint CLI overrides, without
changing the baseline configuration. Counts above exclude nine existing unused
`react/prop-types` suppression warnings in test files.

Completed here: the three unescaped-entity reports in `weirlevels.js` and
`footer.js` were fixed with HTML entities that preserve visible text;
`react/no-unescaped-entities` is enabled globally. `react/display-name` is enabled
outside test mocks. The two behavioral Hooks exceptions remain explicitly disabled
pending #56; no Hooks refactor or caching migration is included.

Reference: [Next.js unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
and [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag).
