# Proposal: Historical high-water event explorer

**Tracking:** [#105](https://github.com/tclare95/isHPPOpen/issues/105); baseline historical explorer [#104](https://github.com/tclare95/isHPPOpen/issues/104); RDP backfill [#50](https://github.com/tclare95/isHPPOpen/issues/50). **Status:** proposed product capability, not an implementation approval.

## Why

A continuous river-level chart is useful, but visitors also want to revisit meaningful high-water periods: when did the Trent rise, what was its observed peak, how long were conditions above a level, and how did levels recover? RDP historical imports make past-event exploration plausible without searching scattered scraper snapshots. The RDP discovery record cites Colwick's 5.34 m peak on 4 January 2024 as an example; it must remain a data-driven result rather than a hard-coded product fact.

## Product outcome and delivery boundary

First, visitors can browse **Colwick high-water events inferred from observed level history** and open an event detail view containing available start/peak/end evidence, time at/above the established 2.2 m HPP level reference, historical graph and visible gaps/quality limitations.

Second, when histories for the appropriate additional level measures have actually been imported and verified, the same event view can support a side-by-side comparison of related gauges. This is a **later, independently accepted extension**, not a prerequisite or a promise of a river-travel-time predictor.

## Important distinctions

- An observed high-water event is **not** a confirmed HPP operational closure, a flood warning, or evidence a course was safe/unsafe. [#89](https://github.com/tclare95/isHPPOpen/issues/89) owns authoritative HPP transitions.
- Missing readings are uncertainty: they do not establish a crossing, uninterrupted exceedance, start/end time, peak or recovery duration. Do not connect events across unknown periods silently.
- Qualifying/correcting upstream history can change historic event boundaries and rankings. An event page must reflect the underlying time window/measurement and clearly state evidence limitations, without purporting to recreate what was reported live.
- Levels are station-datum-specific. Absolute mASD levels from different stations must not be read as directly comparable **depth**; Shardlow flow is a separate parameter.

## Ownership, dependencies and non-goals

- Product/docs and website presentation: `tclare95/isHPPOpen`; source observations remain with `tclare95/river-data-platform` and its private read contract [#69](https://github.com/tclare95/isHPPOpen/issues/69).
- Baseline: [#104](https://github.com/tclare95/isHPPOpen/issues/104) supports historical navigation and evidence presentation; this proposal adds event identification/detail only.
- Data: Colwick 2016–2025 reported imported ([RDP #39](https://github.com/tclare95/river-data-platform/pull/39)); Shardlow-level/Kegworth historical import scope is **proposed**, not performed, in open [RDP #42](https://github.com/tclare95/river-data-platform/pull/42). Church Wilne and Shardlow flow historical equivalence require additional evidence; do not quietly assume parity.
- Non-goals: return-period claims, predictive travel-time service, rainfall causation, flood/hazard warnings, gauge collection changes, generic event database, reconstructed HPP notifications, subscriber changes, new AWS resources or any backfill execution.

**This OpenSpec and associated issue are documentation only.** Delivery and operational releases remain separately authorised.
