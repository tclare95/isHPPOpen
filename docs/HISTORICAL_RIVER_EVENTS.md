# Historical high-water events (#105)

Implementation of the Colwick first release of the
[historical-river-events OpenSpec](../openspec/changes/historical-river-events/specs/historical-river-events/spec.md).
Visitors can discover past periods when the **observed** Colwick river level was at or above HPP's 2.2 m level
rule, see when the river rose, its observed peak, how long it stayed up and how it recovered, and open a
deep-linked hydrograph of the underlying 15-minute readings.

**Events are river-level evidence, not HPP closures.** Nothing here reads or writes `openIndicator`, replays HPP
transitions (#89), sends or schedules notifications, changes alerts, or touches RDP ingestion, AWS, operational
source modes or production data. Every page says so prominently.

## Where it lives

| Surface | What it shows |
| --- | --- |
| `/history/events` | Timeline of every event since 2016 (stem = observed peak, base bar = observed span; hollow/dashed = not fully observed), "highest observed peaks" spotlight, year/month scope, sort (newest, oldest, highest peak, longest), hide-brief toggle, scope tiles and the event list. Filters live in the URL. |
| `/history/events/[id]` | One event: headline, limitation badges, tiles (peak + rank, time at or above + rank, rise to peak, peak to recovery), hydrograph of readings ±3 days with the event span shaded and the peak marked, "What the readings show" (rise → peak → return, with the evidence for each), dips and gaps during the event, previous/next event, link to that month in `/history`, evidence panel. |
| `/history` (#104) | "Browse past high-water events" link, and "High-water events in {period}" under the period chart, including events that began before or continue after it. |
| `GET /api/history/colwick/events` | All events (public shape below), the rule, data range, failed months, coverage. |
| `GET /api/history/colwick/events/{id}` | One event plus `rank`, `previous`/`next`, chart `window` and raw `readings` (`[unixSeconds, value, flag]`, as the month route). `400` for a malformed id, `404 { reason: "not_found" }` when no event matches. |

The id is the UTC instant of the event's first reading at or above 2.2 m, e.g. `20231219T1745Z`.

## Architecture

```text
libs/history/digest.js      buildPeriodDigest(...) now also returns `timeline` (per cached month)
libs/history/timeline.js    buildStateTimeline / stitchTimelines — pure
libs/history/events.js      identifyEvents / eventsInPeriod / findEvent / eventId — pure
libs/history/eventPresent.js  wording for boundaries, peaks, limitations — client-safe
libs/history/historyService.js  getEventsIndex / getEventDetail (server-only)
```

- **No new reads or stores.** A month's timeline is computed from the same bounded, padded RDP read as #104 and
  cached inside the month digest (`unstable_cache`, 24 h for completed months, 15 min for the current month). The
  index composes the same ~130 cached month digests the overview uses (same concurrency 4 and 40 s deadline) and
  identifies events on every request: ~350 segments, negligible compute. The detail reads raw readings from the
  cached month evidence the month route already uses. No event database, search index, RDP endpoint or AWS
  resource is added.
- **Payload.** Index ≈ 80 KB for 95 events; a detail ≈ 55 KB for a three-week event. Detail windows longer than
  200 days are trimmed to the event start and say so.
- **CDN.** Index: `s-maxage=900` (always includes the current month), `60` when any month failed. Detail: `3600`
  for completed events, `900` if it touches the current month or has no end yet, `60` if any month around it
  failed. `stale-while-revalidate=86400` throughout.
- **Failures** use #104's fixed public reasons (`integrity`, `temporary`, `unavailable`, `unreliable`). A month that
  cannot be read becomes an unknown `read_failed` interval: events next to it get an unobserved boundary and are
  never joined across it; the list and timeline disclose which months failed. A read failure is never shown as
  "no events".
- **Reuse.** `components/history/StatusBlocks.js` (read-failure notice, loading block, SWR options, slow-load
  hint) is now shared by `/history` and the event pages; `LevelChart` gained optional `highlights`/`markers`;
  `EvidencePanel` gained a `readingsLabel`.

## Event identification

Eligibility and time attribution are exactly #104's ([HISTORICAL_RIVER_CONDITIONS.md](HISTORICAL_RIVER_CONDITIONS.md#evidence-rules)):
qualified (Hydrology `Good`, including provider `Edited`) and provisional readings are eligible; suspect, missing
and unknown-quality readings are excluded and become gaps; each reading supports time up to halfway to a
neighbour at most 30 minutes away; everything else is unknown.

1. **Timeline.** Each month's eligible readings become ordered `above` / `below` / `unknown` segments. Months
   abut exactly at their (padded) boundaries, so stitching reproduces one continuous read: an event across a
   month or year boundary is one event, with the same time at or above as the #104 month totals.
2. **Event.** Readings at or above 2.2 m (`value ≥ 2.2` to the millimetre) less than **24 hours** apart belong to
   one event, whatever lies between them. Dips below 2.2 m and unknown intervals inside an event are listed, and
   never counted as time at or above. A gap or dip of 24 hours or more separates events.
3. **Start / end** of each event, from the readings around its first/last reading at or above 2.2 m:

   | Status | Meaning | Wording |
   | --- | --- | --- |
   | `observed` | The neighbouring reading (≤ 30 min away) is below 2.2 m | "Below 2.2 m at 17:30; at or above by 17:45." No crossing instant is interpolated. |
   | `within_gap` | Readings are missing, but the nearest reading beyond the gap (< 24 h away) is below | "Last below at …, then 3 h when no readings were returned. First at or above at …; the exact time it rose is not known." |
   | `unknown` | No earlier/later reading, the nearest one is ≥ 24 h away, or the level was also high beyond a long gap / failed month | "Start not observed … may have begun earlier." |
   | `unknown` + `ongoing` | No later reading and the trailing interval reaches the present (not a failed read) | "No end observed yet … it may continue." |

4. **Peak** = highest eligible reading in the event (earliest on ties). It is labelled "Highest observed" with
   a reason whenever readings are missing inside the event or a boundary is `unknown`.
5. **Duration** = supported time at or above 2.2 m. Shown as "at least …" whenever a boundary is not observed or
   readings are missing inside. Rise = first reading at or above → peak; recovery = peak → last reading at or above.
6. **Completeness.** An event is *fully observed* only with observed start and end, no unknown time inside and no
   provisional readings. Otherwise it carries limitation codes: `start_unobserved`, `end_unobserved`, `ongoing`,
   `gaps_within`, `provisional`. Events under 6 h at or above are marked *brief* (shown by default, can be hidden).
7. **Revisions.** Events are recalculated from RDP's canonical history on every read, so corrections can move,
   merge, split or re-rank them. Ranks say "of N events identified" and the spotlight says it is not a flood
   record. An id that no longer starts an event resolves to the event now containing that instant
   (`match: "moved"`, with a notice); otherwise `404` explains that revisions can move or remove events.
   Provisional, provider-edited and revised (`revision > 1`) reading counts are shown per event.

Times are UTC instants throughout; dates and times are displayed in Europe/London.

## Evidence from real history

Run locally over the public EA Hydrology series RDP imported (2016–2025, `npm run history:fixtures`), the rule finds
**95 events** (7 brief), 94 fully observed. The only incomplete one is 1–16 Jan 2016, already high when imported
history begins, so its start is `unknown` ("no earlier readings in the archive"). The Hydrology import has no gaps
long enough to create `within_gap` boundaries; those paths are covered by tests.

The highest observed peaks, as data rather than assertions:

| Event (observed span) | Observed peak | At or above 2.2 m |
| --- | --- | --- |
| 19 Dec 2023 – 10 Jan 2024 | **5.343 m**, 4 Jan 2024 20:15 UTC | 21.3 days |
| 19 – 27 Oct 2023 | 5.001 m, 22 Oct 2023 | 8.0 days |
| 9 Feb – 5 Mar 2020 | 4.982 m, 18 Feb 2020 | 24.7 days |
| 5 – 12 Jan 2025 | 4.900 m, 8 Jan 2025 | 6.9 days |

The January 2024 peak matches the 5.34 m figure in the RDP discovery record, now derived from the readings. Its
event began on 19 Dec 2023, so the January 2024 month view lists it as "Began before January 2024" rather than
cutting it at the calendar boundary. The longest event is 26 Oct – 2 Dec 2019 (34.7 days at or above).

## Product decisions (not fixed by the OpenSpec)

1. **24-hour grouping window.** Chosen so one flood with a brief dip below 2.2 m (or a short telemetry gap) is one
   event, while separate rises a day or more apart stay separate. Alternatives: 12 h (more, smaller events) or no
   merging (every dip splits). Dips and gaps are always itemised, so the choice changes grouping, not evidence.
2. **All events listed, brief ones labelled.** No "significance" cut-off hides data by default; visitors can hide
   events under 6 h. Alternative: list only events above a duration/peak; rejected as it would make counts disagree
   with the #104 "days reaching 2.2 m".
3. **Single 2.2 m reference.** The OpenSpec's initial threshold; no second flood-level threshold is invented.
4. **Provisional live readings participate** (as in #104) but make an event `provisional`/not fully observed.

## Limitations and rollout

- **Cache keys bumped (`history-colwick-*-v2`)** because month digests now carry the timeline. After a
  (separately approved) deployment, the first `/history` overview and `/history/events` loads rebuild the month
  cache over a few requests, exactly like #104's first cold build (RDP concurrency was raised to 10 in RDP #43).
- **Production not exercised here.** As for #104, local runs use EA Hydrology fixtures because the RDP client
  needs Vercel OIDC. After an approved deploy, check `/api/history/colwick/events` lists ~95 events for 2016–2025
  and `/api/history/colwick/events/20231219T1745Z` returns the 5.343 m peak. Preview reads RDP staging, which has
  no imported history, so preview event pages will mostly be empty.
- **RDP gap Jan → early Sep 2026.** Production has no Colwick history for that span (#104). Late-December 2025
  events end before it; any event touching it would be marked not fully observed, never joined across it.
- **Coverage** stays "unknown" until RDP publishes a reviewed coverage inventory (#69); events say completeness is
  not formally confirmed.
- **Multi-gauge comparison** (OpenSpec "later" section) is not implemented: it awaits verified Shardlow/Kegworth
  imports and measure equivalence (RDP #42).

## Tests

- `__tests__/historyEvents.test.js` — threshold equality, well-supported events, agreement with #104 month totals,
  month/year-edge stitching and period overlap, gaps before/within/after events, long gaps, excluded readings,
  isolated readings, dips and grouping, ongoing vs failed-month ends, provisional/edited/revised counts, corrected
  peaks and moved links, id parsing.
- `__tests__/historyEventsService.test.js` — bounded read-only use of the RDP reader, cross-month event from month
  reads, failed month disclosure and splitting, detail window/readings/rank/neighbours, moved and missing ids,
  archive failure propagation.
- `__tests__/api/history-events-api.test.js` — id validation, cache headers, 404 for revised-away ids, error mapping.
- `__tests__/historyEventsComponents.test.js` — list, scope across boundaries, URL filters, read failure vs no events,
  failed months, fully observed vs incomplete detail wording, moved links, not-found, events in `/history`.

## Local development

```bash
npm run history:fixtures -- --live-from 2026-09-07T00:00:00Z
HISTORY_DEV_FIXTURE_DIR=.history-fixtures npm run dev   # then open /history/events
```
