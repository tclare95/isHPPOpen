# Design notes: Historical river conditions

The [product specification](specs/historical-river-conditions/spec.md) is authoritative. These are **constraints and options**, not instructions to build a new analytics service.

## Existing seam and verified facts (5 November 2026)

- isHPPOpen already has a server-only OIDC/STS/SigV4 RDP client (`libs/rdp/client.js`) and a short-window Trent reader (`libs/rdp/trentSeries.js`); the latter intentionally limits history to seven days, three pages and a 672-reading display.
- RDP's four private read routes include `GET /v1/measurements/{id}/observations`: 366 days per request, up to 5,000 rows per page, cursor continuation with 30-minute expiry and archive/hot stitching. Full 15-minute annual history is tens of thousands of readings, so a single-page or uncapped multi-year browser fetch is inappropriate.
- Colwick `ea-colwick-level` is mASD/ASD, rule boundary `>=2.2 m` (see HPP [#89](https://github.com/tclare95/isHPPOpen/issues/89)). Import reports 2016–2025 canonical rows; its proof is [RDP #39](https://github.com/tclare95/river-data-platform/pull/39), which is still an open *documentation record*.
- RDP `coverage.json` is `[]` on main even after import. Reads reporting `pageIntegrity=verified` demonstrate returned-object integrity **not** historical source completeness.

## Sensible first implementation approach (non-binding)

Prefer a small dedicated **historical** server read path over enlarging the live `/api/trentweirs` payload. Use bounded time windows, finite pagination and error-aware responses. Display overview/summary at sensible temporal resolution, then allow zoom to raw readings. Compute and cache small aggregates using existing app patterns where practical; justify any new persistent summary only with measured use. No new RDP endpoint or queue is an initial prerequisite.

For timing, recognise the distinction between an instantaneous stage sample at a time and a proven continuous interval. A 15-minute cadence alone does not establish what occurred during missing time. Show observed/eligible denominator and unknown portions; define a defensible elapsed-time policy in implementation and test threshold equality, variable intervals, boundary crossings and DST/UTC. Use calendar months/years in the site's desired UK presentation timezone, but retain UTC instants for reads and analysis.

Treat provider `Good`/`Edited` history as usable qualified evidence where appropriate; `Unchecked`, `Missing`, `Suspect`, unsupported quality strings and import provenance require explicit handling rather than blind inclusion. Avoid a heavyweight quality ontology: document the chosen eligibility rules and their effect on each summary. If a coverage inventory remains unknown, never label the result formally complete.

## UI and release choices

A new historic page or a section reachable from the existing HPP statistics are both viable; avoid duplicating full history controls in every widget. Make the static figures replacement a separately checkable feature; existing operational `/api/hppstatus` rolling windows continue independently. RDP read IAM remains server-side. Use normal public page access with bounded request inputs, caching and transparent source-age labels.

Do not use this as the pretext for a different historical storage system, automatic coverage publication, live RDP source switch, or importer changes. Those need their own evidence and approval.
