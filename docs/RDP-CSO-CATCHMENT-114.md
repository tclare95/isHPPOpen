# Whole-catchment CSO monitoring on `/waterquality` (#114)

The optional "Whole-catchment monitoring" section reads RDP's reviewed `hpp-catchment` collection set (RDP #104 relationships,
#108 set and whole-set read). That set holds 1,514 Severn Trent outfalls upstream of Holme Pierrepont. For the last
48 hours the section shows:
- how many outfalls are monitored, and at how many distinct locations;
- which have a fresh spilling report, which stopped recently and which recorded a spill;
- which are unknown, and why;
- how much of the window RDP actually collected.

A collapsed, read-only table compares this evidence with the existing Sewage Map density and legacy status history,
aligned by the legacy observation time.

It is **descriptive only**. It never feeds `waterQualityIndicator.js`, the density series or chart, the 0.0105/0.0258
calibrated thresholds, the current-status map or alert evaluation. It ships behind `RDP_CSO_CATCHMENT=on` (default off).
While the flag is off, the route returns `{ enabled: false }`, the section renders nothing and
`libs/rdp/csoCatchment.js` is never loaded.

## Code map

| Piece | File |
| --- | --- |
| Page read `getCsoSetActivity(set, { hours, limit, cursor })` | `libs/rdp/client.js` |
| Contract `parseCsoSetActivity` (shares the status-row rules with the status read) | `libs/rdp/csoContract.js` |
| Walk, cache, per-outfall states, locations, coverage, lag, legacy comparison | `libs/rdp/csoCatchment.js` |
| Legacy reads `getLegacyWaterQualityObservations`, `getLegacyCsoStatusHistory`; flag and dispatch | `libs/services/waterQualityService.js` |
| `GET /api/waterquality/cso/catchment[?set=hpp-catchment]` | `app/api/waterquality/cso/catchment/route.js` |
| Section UI | `components/functional/csoCatchmentMonitoring.js` |

## What it does not do

- It does **not** recreate River Tracer's `rdp.cso-activity/v1` metric. RDP produces that metric offline (`river-impact`)
  and it has no online endpoint. The section presents the collection set's own status, events and coverage instead.
- It publishes **no density**. RDP's counts are not Sewage Map's `number_CSOs_per_km2`, because they differ in:
  - catchment boundary: ORN DEM containment vs. a D8 raster;
  - population: all 1,514 catchment outfalls vs. the 48-hour activity-filtered `CSOs` list;
  - denominator: none is computed here;
  - location semantics: identical coordinates vs. occupied D8 cells.
- Replacing the risk metric needs a versioned method and a separately reviewed calibration.
- No indication, alert, threshold or membership change.

## Reading the set

| Read | Bound | Cache |
| --- | --- | --- |
| Set activity pages | `hours=48`, `limit=100`; pages follow the cursor sequentially (the cursor chains them, so they cannot run in parallel); at most 25 pages (2,500 outfalls); no new page after 120 s (production pages take about 4 s each, so 1,514 outfalls take about 70 s) | Data cache 10 min, only for a **complete** walk |
| Catalogue (locations, names, set attribution) | shared with #120/#121 (≤ 10 pages) | 6 h |
| Legacy summaries and `csoData` in the window | ≤ 2,000 summaries; ≤ 20,000 status rows for ≤ 100 listed IDs | none (one read per CDN miss) |
| Whole request | 170 s deadline; route `maxDuration` 180 s | CDN `s-maxage=300, stale-while-revalidate=600` when `available`, else `s-maxage=60`; errors `no-store` |

At 1,514 outfalls a walk is 16 page requests. Concurrent misses in one instance share one walk (`coalesce`), and the CDN
and data cache mean a page view never starts a walk by itself. Only reviewed sets (`CATCHMENT_SETS`) are accepted, so the
route is not a general RDP proxy.

### Failure handling

| Situation | Result |
| --- | --- |
| First page fails: `SET_NOT_FOUND`, auth, 503 (every outfall failed), timeout | `state: unavailable`, `reason` = `set_not_enabled` / `not_authorised` / `read_failed`. The rest of the page is unaffected |
| A later page fails, or the page/time budget is reached | `state: partial`. The outfalls already read are shown; the rest are counted as `not_read`, never as clear. This result is not written to the data cache, so the next request retries |
| `CURSOR_STALE`, or a total/source that changes mid-walk | The walk restarts once; a second change is handled as a failed page |
| Same outfall on two pages | Counted once; `read.duplicates` is reported and the walk is incomplete |
| `meta.partial` (per-outfall storage failure) | That outfall is `unavailable` (unknown); `state: partial` |
| Catalogue unavailable | Counts are still shown; locations are reported as unavailable (`withoutLocation`); `state: partial` |
| Legacy Mongo read fails | The monitoring summary is still shown; `comparison.state: unavailable` |

**Effective selection.** The response reports:
- `selection.reportedTotal`, the set size RDP actually serves on this stage;
- `matchesReviewed`, whether that equals the reviewed 1,514;
- `catalogueMembers`, the catalogue assets attributed to `hpp-catchment`.

A mismatch is shown on the page. It confirms the live selection on every read, rather than assuming that merged
configuration is live.

## Per-outfall states

Classification reuses the page's existing `classifyRdpLocation` rules (#120), applied **at request time**. A cached
walk is therefore never described as fresher than it is.

| State | Meaning | Counted as |
| --- | --- | --- |
| `active` | Fresh, verified spilling report (RDP effective and provider reported states agree) | evidence |
| `recent` | Fresh not-spilling report; the latest event ended (provider-reported) within 48 h | evidence |
| `not_spilling` | Fresh not-spilling report, no recent event | evidence |
| `offline` | Fresh report that the monitor is offline | unknown |
| `stale` | Report older than 30 minutes, or RDP freshness `stale` | unknown |
| `unresolved` | RDP `unresolved`, contradictory reports, a held/ongoing/unresolved/end-not-reported latest event | unknown |
| `no_observations` | In the set but never observed | unknown |
| `unavailable` | RDP could not read this outfall | unknown |
| `not_read` | Missing page or budget stop | unknown |

"Spills in 48 hours" counts the outfalls with any RDP event in the window, plus the event total and how many lack a
provider-reported end. Ends are never estimated.

### Outfalls versus distinct locations

Every count is given for outfalls **and** distinct locations. Outfalls with identical published catalogue coordinates
(to 5 decimal places, about 1 m) are one location. Outfalls without coordinates are reported separately as
`withoutLocation`; they are never merged into a location or assumed distinct. The section also states how many outfalls
share a location (`outfallsAtSharedLocations`), and each highlighted outfall says how many others share its location.
This is a display rule, not a D8 occupied-cell count.

### Coverage and lag

Per outfall, coverage is summarised with the #121 `summariseCoverage` rules (a gap opening within RDP's 45-minute
tolerance is `awaitingNextCheck`). The section reports:
- collected throughout, partly collected and not collected (coverage `unknown` or 0 %);
- the gap count and the earliest collection start;
- `reportingCompleteness: unverified`.

Lag is the median, p90 and maximum provider `sourceAgeSeconds`, plus the age of RDP's answer (`readAgeSeconds`). The
latter can include the data-cache age.

## Comparison report

### Method

Each row is the **last legacy `waterQuality` observation in a clock hour**, at its own `scrape_timestamp`, inside the
RDP window. RDP's evidence is evaluated at that same instant:

| Column | Source | Notes |
| --- | --- | --- |
| Existing density | legacy `number_CSOs_per_km2` | the value the chart, thresholds and alerts use, unchanged |
| Existing upstream count | legacy `number_upstream_CSOs` | Sewage Map occupied D8 cells |
| Existing list: spilling / reporting | legacy `CSO_IDs` at that observation × `csoData` `Status` scraped ≤ 30 min before (≤ 5 min after) | like-for-like member check; optional (#68): `—` with `legacyStatusHistory.state` `none`/`unavailable` once legacy collection stops, while density rows remain |
| RDP outfalls collected | outfalls whose RDP coverage spans the instant (no gap, within 45 min of the last poll) | "Not collected" before RDP collection began |
| RDP spilling outfalls | lower: ongoing or provider-reported interval contains the instant; upper: also events whose end was never reported, up to `endNoLaterThan` | shown `lower–upper` when they differ |
| RDP spilling locations | distinct locations of the lower set | not occupied cells |

For outfalls on the legacy list at each instant, `memberAgreement` counts:
- `bothSpilling`, `legacyOnly`, `rdpOnly` and `neither`;
- `rdpUncertain`, where RDP's end was not reported;
- `notComparable`, where there is no fresh legacy record or RDP did not collect.

This compares the same outfalls at the same time without combining the two catchment-level series.

### Findings (from the producer and consumer evidence; no live capture in this change)

1. **Populations differ by more than two orders of magnitude.**
   - The legacy list is the Sewage Map 48-hour activity-filtered `CSOs` (5 members on 2026-11-12, all in `hpp-catchment`).
   - RDP monitors all 1,514 catchment outfalls, most of them dry at any time.
   - Counts of spilling outfalls therefore have no fixed ratio to the legacy density.
2. **The denominators differ.** The legacy density divides occupied D8 cells by an unrecorded D8 area. RDP's catchment
   is 7,481.69 km² (ORN DEM). RDP's own *inference-only* note maps the 0.0105/0.0258 thresholds to about 79 and about 193
   cells at that area. That is not a calibration, and this section does not use it.
3. **Locations are not cells.** Co-located outfalls collapse to one location here. A D8 cell can also hold
   nearby non-identical coordinates. Neither direction is a safe proxy without review.
4. **Coverage is still young.**
   - `hpp-catchment` collection began on 2026-11-12 at 16:41Z.
   - Until 48 hours after that, every row before the start shows "Not collected", and most outfalls are `partlyCollected`.
   - `reportingCompleteness` is `unverified` in RDP v1: the provider publishes a single latest-event slot, so short spills
     between polls can be missed.
5. **Bounds, not values.** Events with no reported end make the RDP spilling count a range. The section shows both
   bounds rather than choosing one.

**Not established here:**
- live numbers for the HPP set (read-only production AWS access was not used in this change);
- any correlation or calibration between the series.

After `RDP_CSO_CATCHMENT=on` is approved for Production, the route's `comparison` block is the evidence to collect.
Then review at least two weeks of collected coverage before proposing a versioned RDP-based risk method.

### Recommendation

Keep the legacy density, chart, thresholds and alerts as they are. Use this section to accumulate whole-catchment
evidence. Any replacement metric must:
- be defined as a versioned method on RDP's producer output (`rdp.cso-activity/v1`, once available online), not computed in
  this app;
- be calibrated separately against at least a full season of collected coverage;
- be reviewed before it touches the indication or alerts.

## Deployment state and prerequisites

- **RDP production (merged config and recorded evidence).** Production `enabledSets` includes `hpp-catchment`, with
  `cso_read: true`. RDP's CSO-OPERATIONS records production runs over 1,517 outfalls on 2026-11-12. #121 recorded that
  the production caller role holds all seven `/v1/cso/*` resources, including `sets/*/activity`.
- **Live re-check.** This change could not re-verify the live stack or IAM: read-only AWS calls were not permitted in the
  implementing session. The section verifies the set at runtime instead:
  - `SET_NOT_FOUND` shows as "not enabled on this environment";
  - an IAM gap shows as `not_authorised`;
  - a size mismatch is shown on the page.
- **Staging / Preview.** Staging has `cso_read: false` and no enabled sets, so Preview shows "not enabled" or "temporarily
  unavailable".

## Production activation (2026-11-13)

- Approved by the owner. `RDP_CSO_CATCHMENT=on` (Production, sensitive) was added, and the merge build
  `dpl_BiKt6Er1nf3XGR29UbVnM2sPqJRj` (`9852fe1`) was redeployed. It was the newest Production deployment when re-listed
  immediately before the redeploy. Result: `is-hpp-open-46cjc70ky`, aliased `ishppopen.co.uk`.
- First live read (about 10:56Z):
  - `enabled: true`, `selection.reportedTotal` 1,514 (`matchesReviewed`, 1,514 catalogue members);
  - no auth or `SET_NOT_FOUND` failure.
- **The walk stopped on its 25 s time budget after 6 of 16 pages** (about 4.2 s per page), so `state: partial` with 914
  outfalls `not_read`. Because partial walks are not cached, every CDN miss repeated a 6-page walk.
- Fix: the budget is now 120 s and the route `maxDuration` 180 s (the River route already runs at 180 s in Production).
- Read outfalls:
  - 600 outfalls at 553 distinct locations (84 outfalls at 37 shared locations);
  - 596 fresh reports (0 active, 2 recent), 4 offline;
  - collection began 2026-11-12T16:41:51Z, so all 600 were partly collected (mean 38 % of the 48 h).
- Comparison: 48 hourly observations, RDP collected at 18 of them. The legacy density was a flat 0.00067. Listed-member
  agreement: both 1, legacy only 2, RDP only 2, neither 49, not comparable 221 (mostly before RDP collection began).
- Second fix: the latest comparison row showed "Not collected" because the gap awaiting RDP's next poll was treated as
  missing collection. It now uses the same awaiting-next-check rule as the coverage summary.

## Rollout

1. Merge. The flag is off, so there is no behaviour change.
2. Setting `RDP_CSO_CATCHMENT=on` in Production and redeploying is a separate action that needs explicit approval.
3. Rollback: unset the flag, or set it to anything other than `on`.
