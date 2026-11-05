# Design notes: Historical high-water events

The [product spec](specs/historical-river-events/spec.md) defines behaviour; this document is about implementation judgement and constraints, **not** a mandate for new infrastructure.

## Existing data and dependency sequence

Colwick's reported 2016–2025 production import provides a substantial first dataset. Use the existing RDP signed read API and historical browsing seam from [#104](https://github.com/tclare95/isHPPOpen/issues/104) where practical. The RDP API returns a maximum of 366 days per query, chronological pages and explicit gaps/quality information; its `coverage.json` is currently empty. A returned and checksum-verified row is not proof that intervening time was continuously monitored.

A useful event is an **analysis of observed levels relative to a named threshold**, not a new RDP domain or a migration of HPP status. Start with the known Colwick 2.2 m reference. Event summaries may be computed when requested or derived/cached using existing website conventions; do not create a permanent event store or RDP search index without evidence of a concrete need.

## Evidence boundaries to settle in implementation

- Eligible quality values and source corrections (including Hydrology `Edited`) require a documented, testable policy consistent with the historical-conditions feature.
- Decide how events are located across window edges and partial data *without* inventing an exact threshold-crossing timestamp between 15-minute samples. Where necessary, use "first observed above" and "last observed below" wording instead of exact hydrological onset.
- Define what can be called a complete event, and how a missing/unknown span changes counts and summaries. Do not hide truncated API pages as complete events.
- Preserve UTC source observation identities while presenting human-readable dates in the website locale. Re-querying corrected history should not produce stale assertions of permanent event rank.
- Historical flood examples are **fixtures or navigation aids**, not a static database of supposed peaks.

## Later comparison and non-goals

RDP [#42](https://github.com/tclare95/river-data-platform/pull/42) proposes approval of Shardlow-level and Kegworth historical import scope; the PR itself imports nothing. Only activate comparator UI once data is actually accessible and verified. Unlike same-station repeated levels, different site datums, watercourses and flow parameters should not share an unqualified axis or imply directly equivalent conditions. A paired hydrograph and observed relative timing may be valuable; predictive travel times require independent validation and belong to later forecasting work.

No impact on existing HPP transition service, alerts, Node scraper, collection configuration, external API security or production data resources is accepted as part of this spec.
