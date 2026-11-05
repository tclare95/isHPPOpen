> **Historical copy — canonical specification relocated.** The maintained requirements, design and acceptance tasks now live in [RDP's river-network-routing OpenSpec](https://github.com/tclare95/river-data-platform/tree/main/openspec/changes/river-network-routing) (tracked by [RDP issue #47](https://github.com/tclare95/river-data-platform/issues/47)). This original is retained for traceability to old suite issues/PRs. **Do not edit or implement from this copy.** See [RDP ownership](https://github.com/tclare95/river-data-platform/blob/main/docs/ECOSYSTEM.md). Migration is documentation-only; no release or feature activation is implied.

# Acceptance and implementation slices: River Tracer (#109)

**Status: documentation only, all unchecked.** Product contract: [spec](specs/river-network-routing/spec.md); non-normative data/implementation considerations: [design](design.md). Work in `tclare95/river-data-platform` through later independently approved implementation PRs.

## 1. Dataset and HPP feasibility evidence
- [ ] Compare OS Open Rivers and OpenRiversNetwork on source/version, licence/attribution, directed connectivity, HPP/Trent reach quality, network gaps, branches, canals and mapped tidal/coastal termination. Record real examples and a justified recommended source; no assumption of perfect GB coverage.
- [ ] Inventory the Sewage Map *linework* and *information-point* GeoJSON shapes against the legacy `waterQuality.mjs` consumer; distinguish current-only and current-plus-recent window semantics. Record any unresolved licence/model/point-density assumptions.
- [ ] Review real Severn Trent #71 catalogue coordinates and receiving-watercourse suitability. Identify a small, attributable HPP fixture set with resolved, ambiguous and unmapped cases. Any live queries/downloads need separate permission and bounded plan.

## 2. Minimal trustworthy routing and GeoJSON
- [ ] Prove a bounded point-to-reach match with deterministic, explainable ambiguous/out-of-coverage outcomes on fixture network geometry.
- [ ] Prove downstream and upstream connectivity including multi-branch paths, gaps, cycles, tide/canal uncertainty and termination; emit valid WGS84 line geometry with trace identifiers, network version and honest partial-result semantics.
- [ ] Export a renderable **per-outfall downstream GeoJSON** result without event/status dependence. A nearby but disconnected reach must not be included.

## 3. CSO-to-network relationships and HPP parity
- [ ] Link only verified #71 provider/outfall identities to reviewed network matches, preserving unresolved identities and revalidation on network/catalogue version changes. Do not activate polling from these links.
- [ ] Produce an HPP upstream outfall candidate set and an evidence-bearing side-by-side report with the legacy Sewage Map `CSO_IDs`/info-point selection. Classify discrepancies (including source and status-window differences), propose reviewed resolution, and record a go/no-go outcome.

## 4. Sewage Map-style dynamic GeoJSON overlay
- [ ] Produce map-ready FeatureCollection(s) of potentially downstream river segments derived from fresh, verified #72 active claims and an explicit bounded completed-event window (including an optional 48-hour view). Include source/event time, source/network version and completeness without mislabelling stale/offline/unknown states.
- [ ] Handle overlapping downstream segments from multiple outfalls with clear contributors; avoid duplicated reach counts or false completeness. Tests cover unmapped outfalls, conflicting status, corrected events, partial feed/coverage and large bounded queries.
- [ ] Provide an inspectable location/info query or Point GeoJSON layer with upstream outfall IDs and scoped counts; include density only with an evidenced denominator and coverage.

## 5. First-party serving and safe consumer handoff
- [ ] Specify and test bounded first-party route/impact/info read contracts, validation, attribution and failure/partial results; preserve existing signed IAM and stage isolation, with browser use through a proper server-side application boundary.
- [ ] Independently review deployment/cache/cost and any network update or data refresh procedure. Document rollback and stable-network version behaviour; no automatic new selection or production expansion.
- [ ] Demonstrate map use with GeoJSON independent of Sewage Map hosted data. Any isHPPOpen change to CSO polling inputs or risk presentation requires a **separate** reviewed cutover with evidence.

## Not authorised by this spec
No code deployment, AWS writes, production network ingest, scheduled jobs, new public API, new CSO polling selection, changes to scraper schedules, model/pollution-risk claims, or HPP consumer switch. Do not mark tasks done without merged implementation and evidence.
