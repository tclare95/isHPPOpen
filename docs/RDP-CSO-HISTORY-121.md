# Recorded CSO event history on `/waterquality` (#121)

The "Recent upstream spills" section lists storm overflow events that River Data Platform (RDP) has
recorded for the HPP upstream outfalls. Visitors can open an event to see its outfall, receiving water,
reported start and end, duration, lifecycle, revision history and source.

It is **descriptive only**. It never feeds `waterQualityIndicator.js`, the density series or chart, the
current-status map, the calibrated thresholds or alert evaluation. It ships behind `RDP_CSO_HISTORY=on`
(default off); while the flag is off the section is not rendered and `libs/rdp/csoHistory.js` is never loaded.

## Code map

| Piece | File |
| --- | --- |
| Event and revision reads (`getCsoEvent`, `getCsoEventRevisions`) | `libs/rdp/client.js` |
| Contract validation (`parseCsoEvent`, `parseCsoRevisions`; catalogue `attribution`) | `libs/rdp/csoContract.js` |
| History assembly, coverage, evidence conclusion, event detail | `libs/rdp/csoHistory.js` |
| Server-side pages and continuation cursors (`paginateHistoryEvents`, `readHistoryCursor`) | `libs/rdp/csoHistoryPages.js` |
| Flag and dispatch (`isCsoHistoryEnabled`, `getPublicCsoEventHistory`, `getPublicCsoEventDetail`) | `libs/services/waterQualityService.js` |
| `GET /api/waterquality/cso/events?window=24h\|48h\|7d\|30d[&outfall=ID][&cursor=…]` | `app/api/waterquality/cso/events/route.js` |
| `GET /api/waterquality/cso/events/{eventId}` | `app/api/waterquality/cso/events/[eventId]/route.js` |
| Section UI | `components/functional/csoEventHistory.js` |
| Map link (focus an outfall; "Spill history for this outfall") | `components/functional/csoMap.js`, `csoMapFocus.js` |

The catalogue read, client, coalescing and identity mapping are shared with the #120 adapter
(`libs/rdp/csoSource.js`).

## Which outfalls

- **Membership** is the legacy summary's `CSO_IDs`, which is the same HPP upstream list the page already uses.
- Each ID is mapped to an RDP canonical asset ID through the verified catalogue (exact `externalId` match,
  Severn Trent first). Event data is read only through canonical, provider-neutral IDs and the
  provider-neutral event contract.
- Only assets with `selected: true` on this stage are read, because only those are collected. The other
  members are counted and reported as "not monitored for events yet". Unmapped and ambiguous IDs are never sent.
- At most 20 outfalls are read per window; any beyond that are reported as `not_read`, never assumed clear.

## Request budget and caching

| Read | Bound | Cache |
| --- | --- | --- |
| Catalogue | shared with #120 (≤ 10 pages) | 6 h |
| Events per outfall | window aligned to 15 min (24h/7d) or 1 h (30d); limit 200, ≤ 3 pages | 15 min data cache, keyed by outfall and window |
| Event detail and revisions | read only when a visitor opens an event; revisions limit 50, ≤ 2 pages | 5 min |
| Whole history request | 15 s deadline, concurrency 4 | — |

Route responses use `public, s-maxage=300, stale-while-revalidate=300` when every monitored outfall was
read. Degraded, unavailable or disabled responses use `s-maxage=60`. Errors use `no-store`. Failures are never
written to the data cache. Concurrent misses in one instance share one read. A page view therefore never
makes one RDP request per rendered list item.

## Evidence rules

- An `ongoing` event has no end. An `unresolved` event, or a `completed` event with
  `boundaryProvenance: end_not_reported`, shows "Not reported by the provider; ended no later than …" and an
  uncertain maximum duration. An end is never estimated.
- `pageIntegrity` must be `verified`, otherwise the page is a contract error. A 503 `ARCHIVE_INTEGRITY`,
  timeout or any other failure marks that outfall `failed`. Its events are missing and the page says so.
- `nextCursor` is followed up to the page budget. Beyond that the outfall is `truncated`. RDP returns events **oldest
  first**, so a truncated read is missing that outfall's **most recent** events. `readThrough` is the latest start that
  was read, and the page says the events after it are missing.
- **Coverage** is computed per outfall up to RDP's `requestAsOf`. A gap that opens within RDP's 45-minute
  collection tolerance of that moment is the next poll not yet having run. It is reported as
  `awaitingNextCheck` and is not counted as missing data.
- `reportingCompleteness` is always `unverified` in RDP v1, so the best possible empty result is "No reported
  events in the available data … not proof that no spills occurred".

| `evidence.conclusion` | When |
| --- | --- |
| `events` | at least one event recorded |
| `no_reported_events` | no events, every monitored outfall read, no gaps, nothing truncated |
| `coverage_incomplete` | no events, but gaps, failures or truncation |
| `unavailable` | no monitored outfall could be read (the UI shows "temporarily unavailable") |
| `not_monitored` | no member is collected by RDP |

**30 days** is always offered. It is described as a full 30-day history only when every read outfall has at
least 80% of the window collected (`evidence.coverage.sufficient`). Otherwise the page shows what was
recorded and says coverage is insufficient.

## Browsing older events (Wave A `cso-history-browsing`)

The list is served **50 events per page, newest first** (start time, then event ID). "Older events", "Newer events" and
"Newest events" move through the whole window. Each page is a separate server request. The browser holds only the opaque
`page.nextCursor` values of the pages it has visited, and it never sees RDP credentials.

**What RDP supports.** `GET /v1/cso/outfalls/{id}/events` is per outfall. It orders events by `startedAt` then `eventId`
**ascending** and has a forward-only encrypted cursor (`CURSOR_STALE` if the served prefix changed). It allows at most
366 days and 500 events per request. The set read (`/v1/cso/sets/{set}/activity`) covers at most 168 h and returns at most
100 events per outfall, oldest first, with `truncated`. RDP has no newest-first order, no `before` cursor and no merged
multi-outfall event listing. Its cursors therefore cannot page a merged, newest-first list directly.

**Mechanism.**

- Every page reads the same bounded, cached window reads as the first page: per-outfall reads (at most 20 outfalls,
  or 40 for the RDP-membership 30-day view, 3 × 200 events each) or the one cached set read. A page request therefore never
  does more RDP work than the first page, and with a warm cache it does none.
- The cursor pins the window the first page read (`from`/`to`), the query (window, outfall, membership basis), the first
  event listed and the last event served, and a count and SHA-256 digest of every `(eventId, startedAt)` served so far. This
  is the same approach as RDP's own cursors.
- Each continuation recomputes the served prefix. If an event already passed over had its start corrected, disappeared,
  or was joined by a late report, the API answers **409** and the page offers "Back to the newest events". It never shows a
  duplicate or skips an event. An ongoing event that ends keeps its start and place, so its new state simply appears.
- Events that start after the first event listed are not mixed into older pages. They are counted in
  `page.newerSinceStart` ("N newer events have been recorded since you started browsing").
- A changed period or outfall restarts at the newest events. A cursor for another query is a 400. A cursor older than
  6 hours, or one from another membership basis (`RDP_CSO_MEMBERSHIP` changed), is a **410** and the page restarts.
- The RDP set read always answers for its own moving window, so the 24 h, 48 h and 7 d views in RDP-membership mode cannot
  be pinned. When that window moves during a traversal, `page.windowMoved` is set and the page says older events that
  ended before the new start are no longer listed.
- `page.total` counts the events that were read. `page.totalIsLowerBound` ("of N or more") is set when any shown outfall was
  truncated, failed or not read. The last page says either "End of the recorded events for this period" or, if the total is
  a lower bound, that other events may exist. A page that fails to load says so and offers "Try again". There is never an
  unending spinner.

**RDP contract gap.** Paging is complete only within the bounded window reads. Events beyond an outfall's read budget (more
than 600 in one window for one outfall, or more than 100 in a set read) and outfalls beyond the read limit cannot be reached
by paging. They are reported, never assumed absent. Reaching them with bounded work per page needs, at minimum, one of these
additions to RDP:

1. `order=desc` (newest first) on `GET /v1/cso/outfalls/{id}/events`, with the same encrypted, stale-checked cursor. The
   consumer could then merge the outfalls' newest events and carry their cursors, reading at most one page per outfall per
   visitor page.
2. A set-scoped event listing, such as `GET /v1/cso/sets/{set}/events?from=&to=&limit=&cursor=`, ordered by `startedAt`
   descending then `eventId`. It would have one continuation, `CURSOR_STALE` semantics and per-page coverage. It would also
   remove the per-outfall read limit for large memberships.

This gap is to be raised as an RDP-owned OpenSpec change. Until RDP provides one of these, the site keeps the honest bounded
behaviour described above rather than walking further pages without a bound.

## Revisions and corrections

The list shows the event's revision number neutrally. **A revision is not a correction.** In production, most
revision-2 events are normal lifecycle steps (`created` → `completed`, or `created` → `end_not_reported`). The
detail lists every immutable revision with what it was before and after. It marks an event "Corrected" only
for `start_corrected`, `end_corrected` or `operator_resolved`. Open holds are shown as "conflicting provider
reports awaiting review"; claim IDs are not exposed.

Source attribution comes from the catalogue's per-provider `attribution`. The detail says whether the event was
reconstructed from live status checks or imported from official historical returns (`historical_imported`).
Imported 2025 data appears only once RDP publishes it. Nothing in this consumer depends on the #70 importer.

## Live evidence (2026-11-12)

The production caller role `river-data-platform-production-vercel-production` has all seven `/v1/cso/*`
resources (read-only IAM check). Production responses were captured read-only as that caller. The current
legacy membership was 5 outfalls, all mapped and selected (`hpp-catchment`; SVT01294 also `hpp-upstream`).

- `hpp-upstream` collection began on 2026-11-07 21:17Z; `hpp-catchment` began on 2026-11-12 16:41Z.
- SVT02056 had 170 events in 30 days (129 completed, 40 unresolved, 1 ongoing).
- There were no `start_corrected`, `end_corrected` or held events in the sample.

A redacted subset is in `testUtils/fixtures/rdpCsoLiveHistory.json` and is run through the real parsers in
`__tests__/rdpCsoHistory.test.js`.

## Rollout

1. Merge (flag off: no behaviour change).
2. Set `RDP_CSO_HISTORY=on` in Preview or Production and redeploy. This is a separate, explicitly approved
   action. Staging has `cso_read` false, so Preview shows "temporarily unavailable" until staging CSO is enabled.
3. Rollback: unset the flag, or set it to anything other than `on`.
