# One storm overflow in focus (Wave C / C4)

`/waterquality/cso/{id}` shows one upstream storm overflow (CSO outfall) on its own shareable page: its identity and
published location, current reported status, recorded spills, monitoring coverage, relationship to HPP and whether a
downstream route can be drawn. Canonical product spec: `openspec/changes/wave-c-rdp-product-features/specs/cso-outfall-detail/spec.md`.

It is **descriptive only**. It never feeds the water-quality indicator, density chart, thresholds or alerts, and it adds no
collection, RDP selection change or new flag. Every section follows the flags that already govern it.

## Address and identity

- `{id}` is the **canonical RDP asset ID** `provider:source:externalId` (for example
  `/waterquality/cso/severn-trent:storm-overflow-activity:SVT01157`); colons are left readable. Coordinates are never
  part of the address, so monitors that share a published location each have their own page.
- A provider-only ID (`/waterquality/cso/SVT01157`, used by legacy map markers and old links) is resolved and the
  browser address is replaced with the canonical one. If that provider ID matches more than one member it is a 404
  telling the visitor to open it from the map instead; nothing is guessed.
- Only outfalls in the HPP membership in use resolve: the legacy `CSO_IDs` list (`RDP_CSO_MEMBERSHIP=legacy`) or any scope
  (confirmed, candidate, catchment-only) of the pinned `hpp-upstream-outfalls` set (`RDP_CSO_MEMBERSHIP=rdp`). Anything
  else, and any malformed ID, is **404**: the route is not a general RDP proxy. An unreadable RDP membership is **503**
  (never a fallback to another list).

## Entry points

| From | Link |
| --- | --- |
| Map marker popup (confirmed and unconfirmed markers) | "Outfall details" (`components/functional/csoMap.js`) |
| Spill history: an opened event, and the outfall filter | "Outfall details" (`components/functional/csoEventHistory.js`) |
| Downstream impact overlay: the highlighted route | "Outfall details" (`components/functional/csoImpactOverlay.js`) |
| A co-located outfall on another detail page | its own canonical link (in-scope outfalls only) |

The detail page links back into the existing map: `/waterquality?outfall={publicId}` focuses the map marker and the spill
history filter; `&route={assetId}` also switches the "Reported downstream spill impact" overlay on with that route
highlighted. Malformed values are ignored. `/waterquality` stays statically rendered (the query is read inside `Suspense`).

## Sections and flags

| Section | Source | When unavailable |
| --- | --- | --- |
| Outfall: provider, provider ID, platform ID, name, receiving water, published location, RDP collection (`selected`), co-located outfalls | Cached RDP catalogue (shared with #120/#121); the membership's own fields when the catalogue fails | "Not resolved"; co-location omitted |
| Relationship to HPP | Membership in use: `confirmed` vs inferred `candidate` / `catchment-only` (labelled "Not confirmed upstream"), reviewed or automatic, set version; or the legacy Sewage Map list | (resolution needs it: 503) |
| Current status | `RDP_CSO_SOURCE=rdp`: one-outfall status read plus the 48 h events read, classified by `classifyRdpLocation` (same rules as the map). `legacy`/`shadow`: the legacy `csoData` record, classified by the legacy rules | Section says unavailable; never spilling or clear |
| Recorded spills (48 h / 7 d / 30 d) | `RDP_CSO_HISTORY=on`: one outfall's event pages (`readEventPages`, shared cache with the history list), `describeEvent`, `summariseCoverage`, `assessHistory`; revisions through the existing event-detail route | Flag off: "not available on this site"; read failure: "temporarily unavailable" |
| Downstream connection | Relationship `routed` flag; link to the existing overlay when `RDP_RIVER_IMPACT=on` | Flag off: route map "not available"; unrouted: "could not be linked to the river network" |

With every RDP flag off (`legacy` source and membership, history and impact off) the detail never creates the RDP client:
identity is the provider ID and status is the legacy record.

## Evidence rules

- An `unknown` status always says why (stale, not read, offline, contradictory, event end not reported, ...) and is never
  shown as "not spilling". A fresh not-spilling report with no recent provider-reported spill still says reporting is
  unverified and is not a confirmation that the outfall is clear.
- An unselected outfall's history is "not monitored", never "no spills"; an empty, fully collected window is "no reported
  spills in the available data", never proof; gaps, truncation and insufficient 30-day coverage are stated.
- Ongoing events have no end; unresolved / end-not-reported events show "ended no later than" when RDP provides it and an
  uncertain duration; revised events show their revision and, when opened, their full revision history and corrections.
- The downstream section repeats the overlay caveat: connection only, not pollution levels, travel time or water safety.
  Unconfirmed relationships say the link is not confirmed.

## Request budget and caching

Per request: the cached membership (6 h) or legacy summary, the cached catalogue (6 h), at most one status read (5 min
cache), one 48 h events read (15 min) and one event-history read (15 min, at most 3 x 200 events). No set walks and no
impact read: the route itself is drawn by `/api/waterquality/river/impact`, CDN-shared with `/waterquality`.

`GET /api/waterquality/cso/outfalls/{id}[?window=48h|7d|30d]` (`app/api/waterquality/cso/outfalls/[id]/route.js`):
complete answers `public, s-maxage=120, stale-while-revalidate=180`; a degraded section `public, s-maxage=60`; 404
`public, s-maxage=60`; other failures `no-store`. Unknown query keys are 400.

## Code map

| Piece | File |
| --- | --- |
| Detail assembly (scope, identity, co-location, status, history) | `libs/rdp/csoOutfallDetail.js` |
| Flag dispatch (`getPublicCsoOutfallDetail`) | `libs/services/waterQualityService.js` |
| Route | `app/api/waterquality/cso/outfalls/[id]/route.js` |
| Page and UI | `app/waterquality/cso/[id]/page.js`, `components/functional/csoOutfallDetail.js` |
| Links (`outfallDetailPath`, `outfallMapPath`, `readOutfallMapQuery`) | `libs/csoOutfallLinks.js` |
| Tests | `__tests__/rdpCsoOutfallDetail.test.js`, `__tests__/api/cso-outfall-detail-api.test.js`, `__tests__/csoOutfallDetail.test.js` |

## Known limitations

- Revision history for an event at a `candidate` or `catchment-only` outfall is not shown: the existing event-detail
  route is deliberately restricted to the confirmed membership. The list still shows each event's revision number.
- The detail does not draw its own map. A route is drawn only by the existing overlay, which RDP publishes only for
  outfalls with a reported spill in the window. RDP's relationship set also carries a release-scoped downstream trace
  path per routed member, which a later slice could draw for any routed outfall.
