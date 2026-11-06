# Design and evidence notes: HPP River Explorer

The [product requirements](specs/hpp-river-explorer/spec.md) are normative. These are verified integration facts and **non-binding implementation guidance**, not an instruction to add a new spatial backend, persistence layer or generic client abstraction.

## Existing seams (reviewed 6 November 2026)

- RDP [River Tracer documentation](https://github.com/tclare95/river-data-platform/blob/main/docs/RIVER-TRACER.md) and implementation expose IAM-protected `GET /v1/river/locate?lon=&lat=`, `GET /v1/river/upstream?lon=&lat=&geometry=reaches|none`, and the matching downstream route. `/locate` supplies match, release, basin, sample/snap offset and release-scoped upstream/downstream links. Trace responses are GeoJSON FeatureCollections with a `riverTracer` member containing match, network, route, summary, catchment (upstream), attribution and caveats.
- A matched coordinate resolves to a canonical sample (approximately 100 m spacing); release-scoped routes can be cached immutably, but a retired release token gives `410 RELEASE_NOT_AVAILABLE`. Coordinate entrypoints carry a bounded cache lifetime. `geometry=none` omits reach LineStrings; large responses may return `413 RESULT_TOO_LARGE`. Preserve summary-only fallback rather than escalating limits.
- The existing isHPPOpen [OIDC/SigV4 client](../../../libs/rdp/client.js) already protects credentials and restricts environment/host, but its request construction is **measurement-specific** and validates measurement envelopes. A small purpose-built River Tracer read adapter or a carefully factored shared transport is needed; do not pretend existing `getObservations` can call river paths directly.
- The existing [water-quality map](../../../components/functional/csoMap.js) uses Leaflet/react-leaflet and already places CSO status markers, but currently **does not** render hydrologically verified routes. Its position is a map centre, not necessarily an approved river-trace anchor. Keep its calibrated source data separate.
- The RDP source describes ORN v2 connectivity and 50 m DEM catchments, **including gaps, downstream pour-point displacement, unresolved candidate outfall links and unresolved public redistribution licensing**. HPP/Trent is a validated example, not proof of every nearby network connection.

## Sensible first implementation

Prefer one discoverable HPP-focused page/section with direction switching, map polyline(s), optional catchment layer and concise summaries; link it from the existing site/navigation and water-quality explanation. Keep a reviewed fixed HPP river point as the first scope. A second stage could let a visitor click another point to explore; no unrestricted public coordinate proxy is required to ship HPP.

Use the least invasive read flow that safely obtains `locate` and a matching direction result from the **same network release**. Cache immutable release URLs and/or bounded display responses where useful, handle a `410` by locating again, and avoid rebuilding a topology graph in the web app. Distinguish locate's JSON envelope from the trace's GeoJSON contract. Avoid masking source provenance when adapting responses. Bound response size, user inputs, failures and cache lifetime; reject unexpected upstream origins.

A selected route can be too large or a catchment polygon may be unavailable. A textual upstream tributary/main-stem view and a downstream named path should remain useful on their own. Explicit text states for partial, ambiguous and unserved results are better than drawing guessed connectors. For map licensing, obtain a positive redistribution decision before enabling public derived GeoJSON/summaries; retain required attribution.

## Independent readiness/release boundaries

1. Confirm the **deployed** River Tracer endpoints and production Vercel caller permissions separately from merged code. The user's report of public availability does not establish that browser-anonymous access or this particular caller permission exists.
2. Choose/review an HPP start coordinate on the mapped Trent and record actual `locate` plus both trace responses (including version, route completeness, snap offset and geometry size).
3. Confirm ORN licence/attribution rights for isHPPOpen's public presentation. If unresolved, do not publish derived geometry.
4. Release the website feature through the normal separately reviewed deployment. No change in scraper, HPP event writing, CSO collection selection or public water-quality calibration is implied.

## Sewage Map dependency replacement (separate approval gate)

Verified legacy behaviour: [scraper `waterQuality.mjs`](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs) reads Sewage Map's information-point GeoJSON and finds the nearest point to `[-1.0948257285275267, 52.944976358291115]` within 250 m. It extracts `CSOs`, `number_upstream_CSOs` and `number_CSOs_per_km2`. [`app.mjs`](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs) writes the resulting `waterQuality` Mongo snapshot and uses `CSO_IDs` to enqueue SQS / inline Severn Trent status polling. The [web service](../../../libs/services/waterQualityService.js) reads those snapshots and CSO status records; [calibration](../../../libs/waterQualityCalibration.json) and CSO density history use the saved `number_CSOs_per_km2`.

RDP already contains `OutfallLinker`, `UpstreamOutfallClassifier`, `river-outfalls` and `river-catchment` **offline** operations. The current production-aimed HTTP routes (`locate`, `upstream`, `downstream`) only trace the river network; they **do not** return validated upstream outfall IDs. The HPP analysis found a substantial **catchment-only/unlinked** population, so catchment containment should not be treated as proof of a verified hydrological connection.

**Minimal useful approach (not binding):** use an RDP-generated, reviewed **HPP membership snapshot** based on #71 catalogue + #47 candidate classification and explicit overrides; consume the resulting fixed set through a narrow compatibility seam in the existing scraper or successor site service. No new generic spatial API, database or live reclassification is needed just to remove the external look-up. For independent RDP consumers, later expose a bounded, IAM-protected upstream-outfalls information query (tracked by [RDP #47](https://github.com/tclare95/river-data-platform/issues/47)), with coverage/mapping classifications and stable IDs. This belongs to RDP and should not be reimplemented as a second hydrological graph in isHPPOpen.

Keep review evidence for **both membership and density semantics**. A static list of upstream outfalls, the count currently reporting active, the count active/recent in a window, and an activity density are distinct measures. Check exactly what Sewage Map's density field represents before determining compatible output or recalibration. RDP #72 current/event reads would support full canonical status migration later, but are not a prerequisite if an approved interim scraper continues polling Severn Trent from a fixed ID set.

A migration may require changes in `ishppopenScraper` and/or isHPPOpen consumers; keep those as explicitly reviewed implementation work. Do not authorize automatic #71 selection changes, unverified spatial matching, dual authoritative writers, historical series rewriting or new alert semantics via this documentation PR.

## Future CSO migration is distinct

The current legacy scraper derives `CSO_IDs` from Sewage Map **information-point** `properties.CSOs`, not simply from a river map. The currently exposed River Tracer locate/upstream/downstream routes do **not** return equivalent reviewed upstream CSO IDs or active/recent impact layers. A future site-specific change should consume a verified RDP outfall-relationship contract, compare against existing selections, investigate unmatched/ambiguous assets, prove water-quality parity and require an explicit reversible cutover. Keep this out of the first River Explorer implementation.
