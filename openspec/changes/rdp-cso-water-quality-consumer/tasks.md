# Acceptance plan — isHPPOpen RDP CSO consumer

All tasks unchecked. Implementation/release approvals are separate from this documentation.

## Slice A — verify and shadow (#120): immediately implementable without source switch
- [ ] Inspect actual deployed signed production RDP CSO read routes, selected IDs, catalogue/health, source lag, 15-min collection continuity, events/coverage; record evidence and open producer gaps under RDP-owned issues.
- [ ] Capture existing Mongo-facing current status, filters, map/card counts, per-CSO detail, density, alert outcomes and timestamp/freshness fixtures.
- [x] Add minimal server-only RDP status/events shadow adaptation and time-aligned discrepancy diagnostics; legacy remains authoritative, no new writes or public contract change. ([RDP-CSO-120](../../../docs/RDP-CSO-120.md); `RDP_CSO_SOURCE`, `/api/admin/cso-shadow`)
- [x] (offline fixtures; live evidence pending the production caller grant) Exercise stale/offline/contradictory, selection mismatch, missing row, changed end, ongoing carry-in, ambiguous hold, incomplete coverage, API 403/404/429/503 and cursor/archive error; guard request budgets/cache.

## Slice B — optional history (#121): separate feature release
- [x] Add optional event chronology/drill-down or comparison on existing water-quality page; distinguish current, recent, historical imported and uncertain evidence. ([RDP-CSO-HISTORY-121](../../../docs/RDP-CSO-HISTORY-121.md); `RDP_CSO_HISTORY`)
- [x] Show coverage gaps, carry-in/out, revisions, unknown vs no reported event, source attribution and method.
- [ ] Show duration/count aggregates only with observed denominator and meaningful uncertainty; do not equate EDM 12/24 annual counts with raw intervals.
- [ ] Compare event-derived activity against legacy density without replacing thresholds/alerts.

## Slice C — independently approved current read switch (#120)
- [ ] Record signed API/SLO, error handling, status/event parity, versioned selection, exact public compatibility and rollback proof.
- [ ] Obtain explicit approval before any authoritative status/events source change; preserve old density and water-quality alert source unless separately approved.
- [ ] Keep one canonical provider event writer: RDP canonical events, Mongo remains legacy only until reader transition and controlled retirement.

## Slice D — distinct membership/metric/alert and writer decisions (#114/#68)
- [x] RDP #64 supplies reviewed HPP upstream relationship artifact; isHPPOpen accepts actual selected set and coverage. ([RDP-CSO-MEMBERSHIP-114](../../../docs/RDP-CSO-MEMBERSHIP-114.md); `RDP_CSO_MEMBERSHIP`, pinned `bb422e98…`)
- [ ] Separately approved: `RDP_CSO_MEMBERSHIP=rdp` in Production after the caller grant and published relationships index are verified.
- [ ] Prove legacy dynamic 48h, co-location occupancy, D8 drainage-area denominator and calibration-year risk/alert transition parity or version/recalibrate with explicit acceptance.
- [ ] Approve Sewage Map runtime lookup retirement **separately**; do not emit fresh zeros for missing data.
- [ ] Obtain separately approved risk/alert switch and protect subscription/rearm/delivery continuity.
- [ ] Prove old SQS/Mongo writers and archives no longer have active consumers before removal; Node mixed-schedule shutdown last.

## Slice E — RDP authoritative reads and legacy CSO collection retirement (#68)
- [x] `rdp` mode reports RDP unavailability honestly and never reads Mongo `csoData`; alerts and operational health read summary freshness only; the catchment comparison treats legacy status history as optional. ([RDP-CSO-RETIREMENT-68](../../../docs/RDP-CSO-RETIREMENT-68.md))
- [x] Scraper: independent switch to stop CSO SQS enqueueing and the inline direct-Severn-Trent fallback without stopping the main schedule ([ishppopenScraper](https://github.com/tclare95/ishppopenScraper)).
- [ ] Separately approved: production shadow evidence and parity review (Slice C), then `RDP_CSO_SOURCE=rdp` in Production.
- [ ] Separately approved: scraper release that stops legacy CSO collection; verify no new `csoData` records and no Severn Trent ArcGIS requests.
- [ ] Separately approved: scraper release that disables the SQS worker event-source mapping and the weekly archiver after the queue drains; existing Mongo records and S3 archives are kept.

## Review-only
No build/test execution, AWS interaction, schema changes, import, code implementation, new live writer, source switch or deployment performed by this OpenSpec.