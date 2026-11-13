# Reported downstream spill impact overlay

An optional layer on the `/waterquality` map. It draws the river reaches connected downstream of reported CSO spills
upstream of Holme Pierrepont, using River Data Platform's live status-aware downstream impact
(`GET /v1/river/impact/{set}`, schema `rdp.river-tracer.impact/v1`; producer: tclare95/river-data-platform#117). The
producer owns routing, impact states and caching; this site only displays them.

**Connectivity only.** A drawn reach is hydrologically downstream of a reported discharge on the mapped network. It is
not a measurement or model of pollution concentration, dilution, travel time, exposure or water safety. The overlay never
feeds the indicator, the density chart, the calibrated thresholds or alerts.

## Behaviour

| Aspect | Behaviour |
| --- | --- |
| Gate | `RDP_RIVER_IMPACT=on` (default off). When off, the route answers `{ enabled: false }` and reads nothing. |
| Visitor control | The "Reported downstream spill impact" switch above the map. Nothing is fetched until it is on. While on, the layer is refetched every 5 minutes (RDP's own refresh interval), with no focus revalidation and no retries. |
| Drawn states | `active` (fresh spilling status): solid red. `unresolved` (an ongoing event without fresh status, or an end that was never reported): dashed orange. `recent` (a completed event that ended inside 48 hours): amber. Shared reaches take the precedence active > unresolved > recent. |
| Never drawn | `unknown` (stale, offline, unmonitored or contradictory status) and `no-reported-discharge`. Unknown outfalls are counted and stated as "not assumed clear". |
| Selection | Pick a spill from the list, select "Show downstream route" in a CSO marker popup, or click a reach. The selected outfall's reaches are emphasised and every other reach fades; nothing is hidden. The panel shows the event ID, start and end, when the status was last checked, route length and completeness, and a link into the existing spill history. |
| Failure | Any RDP error, contract mismatch or timeout returns `503 private, no-store` and the panel says the overlay is unavailable. CSO markers, the river layer and every other section keep working. A failure never becomes an empty layer. |

## Server boundary

- `libs/rdp/client.js` `getRiverImpact(set, { hours })`: a signed, bounded GET (12 MiB decoded cap, counted before
  parsing). The windows are 24, 48 or 168 hours.
- `libs/rdp/riverImpact.js` `parseRiverImpact` is strict. It checks:
  - the schema, the set, the window and the network;
  - every feature kind and geometry (Point and LineString only);
  - that every reach is explained by drawn outfalls under the precedence.

  Its output is compact: drawn outfalls, their reaches, counts, provenance and caveats.
- `libs/services/riverImpactService.js` reads only `hpp-upstream-outfalls`. It requires approval `approved`, and the
  relationship version and network version must equal the reviewed `HPP_MEMBERSHIP` pins. A re-published set returns
  `IMPACT_REVIEW_REQUIRED` (503) until it is reviewed here.
- `app/api/waterquality/river/impact/route.js` accepts only `hours`. Concurrent misses in one instance share one RDP
  read. A successful answer is `public, s-maxage=120, stale-while-revalidate=180`; a disabled answer is `s-maxage=60`.

## Enabling (separate approvals)

1. The RDP side must be live for the stage: the `--river-impact` bootstrap phase, `river_impact_sets =
   hpp-upstream-outfalls=hpp-catchment`, and the Vercel caller re-rendered with `--river` (which adds `impact/*`). See RDP
   `docs/RIVER-TRACER-RELATIONSHIPS.md#online-downstream-impact`.
2. Set `RDP_RIVER_IMPACT=on` for Preview, verify an actual RDP-recorded spill can be selected and its route shown, then
   repeat for Production. Merging this change does not enable it.
