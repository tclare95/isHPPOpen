# RDP upstream outfall membership for `/waterquality` (#114)

This stops the public map, current status and event history from using Sewage Map's runtime `water_quality.CSO_IDs`
list to decide which outfalls are upstream of Holme Pierrepont. They use the approved River Tracer relationship set
that River Data Platform (RDP) publishes instead. Canonical behaviour is requirement R8 in
[`rdp-cso-water-quality-consumer`](../openspec/changes/rdp-cso-water-quality-consumer/specs/rdp-cso-water-quality-consumer/spec.md).

**Boundary.** Sewage Map's list is *dynamic*: monitors active or recently active within 48 hours. The RDP relationship is
*static* upstream membership. They are different things, so this changes only **which outfalls are shown**. These are
unchanged and still read the Mongo `waterQuality` summary in every mode:
- `number_CSOs_per_km2` and the density chart;
- `number_upstream_CSOs`;
- the calibrated indicator thresholds (`libs/waterQualityCalibration.json`);
- water-quality alerts and operational health.

The scraper still reads Sewage Map to produce those fields.

## Producer contract

| What | RDP | Notes |
| --- | --- | --- |
| Membership | `GET /v1/river/relationships/hpp-upstream-outfalls` ([RDP #107](https://github.com/tclare95/river-data-platform/pull/107), ADR-002 D5) | Byte-for-byte published set; RDP verifies its digest first. About 880 KB, within the 3 MB River body bound |
| Set content | `rdp.river-tracer.upstream-relationships/v1` ([RDP #104](https://github.com/tclare95/river-data-platform/pull/104)) | Confirmed / network / catchment scopes: **592 / 831 / 1,514** |
| Status and events | `GET /v1/cso/sets/hpp-catchment/activity` ([RDP #108](https://github.com/tclare95/river-data-platform/pull/108), ADR-002 D3) | The collection set is the relationship's catchment scope (1,514). It is walked by cursor in pages of 100, not read per outfall |

Both are read server-side only, through the existing signed client (`libs/rdp/client.js`, `getRiverRelationships`) and
the Vercel caller role. Nothing is proxied publicly.

## Pins: versioned membership

`libs/rdp/csoMembership.js` `HPP_MEMBERSHIP` accepts exactly one reviewed set:

| Pin | Value |
| --- | --- |
| Set | `hpp-upstream-outfalls` |
| Version (content SHA-256) | `bb422e98d78ee1bc5923c9e1d73c4d41708d3a343c7b31e44133ceeaa934c8d2` |
| Review | `approved` |
| Network | `orn-v2-gb` `838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c` |
| Catalogue | `severn-trent` / `storm-overflow-activity` `9962b46480831b1939812c7f40372b9e8596a67a137b4e266d369703077432f2` |

How a changed set is handled:
- If RDP republishes the set with a different version, network release or catalogue, the read is refused with
  `MEMBERSHIP_PIN_MISMATCH`.
- An unapproved set is refused with `MEMBERSHIP_NOT_APPROVED`.
- A different population is therefore never adopted silently. Accepting a new version is a reviewed code change to
  `HPP_MEMBERSHIP`, and the cache key includes the pinned version.

The parser (`libs/rdp/relationshipContract.js`) also re-checks the set's internal consistency:
- canonical identities are built from the pinned catalogue (`provider:source:externalId`);
- no outfall is duplicated;
- membership equals the confirmed category;
- every scope count matches its listed relationships;
- the coverage denominator adds up.

A set that fails any of these checks is never partly used.

The committed RDP evidence file passes this validation. Run
`RDP_RELATIONSHIP_SET_FILE=<river-data-platform>/docs/evidence/river-tracer-64/hpp-upstream-relationships.json npx jest rdpCsoMembership`.

## Populations

| Category | Scope | On `/waterquality` |
| --- | --- | --- |
| `confirmed` (592) | confirmed | **The HPP view**: `locations`, the count cards, `CSOIds` and the event history |
| `candidate` (239) | network | `relatedLocations`, labelled "Possibly upstream: river link not confirmed". Off the map unless the visitor switches it on, and never in the counts |
| `catchment-only` (683) | catchment | `relatedLocations`, labelled "In the catchment: river link unresolved". Same rules as `candidate` |
| `ambiguous`, `excluded`, `unlocatable` | none | Counted in `membership.notUpstream`, never shown as members |

Identity fields on each location:
- `id` stays the provider-native ID (`SVT01294`), for compatibility with markers, the history filter and `/cso?ids=`. If
  two providers ever share an external ID, both use the canonical ID instead.
- `assetId` is the canonical RDP ID.
- `provider`, `sourceId` and `relationship` (`category`, `reason`, `reviewed`, `routed`) are added.

`membership` gives the set, version, review, pins, scope counts and catalogue attribution. The map and history show it
as a one-line source note.

`relatedLocations` lists only active and recent members, so the payload stays small. Every member is in its
per-category counts.

## Reads and limits

| View | Read | Bound |
| --- | --- | --- |
| Map, cards, `/api/waterquality` | The relationship set (cached 6 h) plus one 48 h `hpp-catchment` walk. The walk is shared with the catchment section's cache (600 s; only complete walks are cached) | At most 25 pages and 2,500 outfalls. No new page is started after 120 s, and the route `maxDuration` is 180 s |
| History, 24 h and 7 d | One walk of the same set at 24 h or 168 h | As above. No per-outfall event reads |
| History, 30 d | Per-outfall event pages for at most 40 confirmed members: those with events in the last 7 days first, then member order | Not-read members are `not_read` with `notReadReason: read_limit`, and the page says so |
| History list | The newest 250 events after an optional `?outfall=` filter | `eventTotals` reports total, returned and truncated. The dropdown lists only outfalls with events |

The old caps were 60 status members and 20 event reads. They still apply to legacy membership, but they no longer
limit the RDP population. Anything not read is counted and explained; it is never treated as clear or as having no
events.

## Failure handling

| Condition | Result |
| --- | --- |
| Membership unreadable, mismatched or unapproved | `membership.state: unavailable`, with `errorCode` and `pinnedVersion`. `locations: []`, `CSOIds: null` and every count `null`. `health.cso.available: false`. History `unavailable`. **No fallback to `CSO_IDs`** |
| Set walk fails on its first page or times out | Every confirmed member is `unknown` / `rdp_unavailable`. Spill/recent counts are `null`; the page says status is unavailable |
| Walk stops part-way | Members not received are `unknown` / `status_not_read`, and `health.cso.partial: true` |
| Member not in RDP's collection set (complete walk) | `unknown` / `not_monitored`; history `not_monitored` |
| Member returned without events | History `failed` (`EVENTS_UNAVAILABLE`) |

No failure is cached. The data cache keeps serving the last good set while it revalidates.

## Switch and rollout

`RDP_CSO_MEMBERSHIP=legacy|rdp`. The default is `legacy`, and any other value is treated as `legacy` with an error log.
It is independent of `RDP_CSO_SOURCE`:

| `RDP_CSO_SOURCE` | `RDP_CSO_MEMBERSHIP=rdp` affects |
| --- | --- |
| `rdp` | Map, counts, `CSOIds` (`/api/waterquality`) and the event history |
| `legacy` / `shadow` | Event history only. The map stays on legacy membership because legacy `csoData` covers only the legacy IDs; `membership.requested: "rdp"` with `reason: "status_source_not_rdp"` says so |

`/api/waterquality/cso?ids=` (detail by ID), the shadow comparison and `/api/admin/cso-shadow` are unchanged.

Activation. Each step is a separate, explicitly approved production action:
1. Merge and deploy. With the default `legacy` there is no public change.
2. Confirm the production caller can read `/v1/river/relationships/*`, and that production pins `river_relationships_index`
   to an index containing the approved set (RDP #107 release order steps 3–5).
3. Set `RDP_CSO_MEMBERSHIP=rdp` in Production and redeploy. The history section changes first if `RDP_CSO_SOURCE` is
   still `legacy`.
4. Verify:
   - `/api/waterquality/cso/events?window=24h` reports `membership.source: rdp` with the pinned version and 592 members;
   - `/api/waterquality` has a `membership` field;
   - with `RDP_CSO_SOURCE=rdp`, `/api/waterquality` has 592 `locations`;
   - alerts and the density tile are unchanged.

**Rollback:** set `RDP_CSO_MEMBERSHIP=legacy` (or delete it) and redeploy. Use an env change plus a redeploy, not
`vercel rollback`. No state is written and nothing re-evaluates alerts.

## Tests

- `__tests__/rdpCsoMembership.test.js` covers:
  - the contract: refusals and the optional real-set check;
  - pins and approval;
  - confirmed vs candidate vs catchment-only;
  - one walk for 600 members with no per-outfall reads;
  - partial and failed walks, and membership failures with no fallback;
  - switch combinations;
  - 24 h, 7 d and 30 d history, the event cap and outfall filter, and event detail limited to confirmed members.
- `__tests__/rdpCsoClient.test.js` covers the signed relationships GET, set-name validation, 404 codes, contract errors and
  the size bound.
- `__tests__/csoMap.test.js` and `__tests__/csoEventHistory.test.js` cover the possibly-upstream toggle and labels, the
  time filters over both populations, the membership note, the event-only dropdown and the not-read and truncation
  messages.
