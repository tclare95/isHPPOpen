# RDP-backed HPP water-quality assessment (`hpp-upstream-activity/v1`)

This replaces the last Sewage Map-derived input to `/waterquality`: the `number_CSOs_per_km2` density that the legacy
scraper copies into Mongo `waterQuality`, which drives the indication, the "Activity over time" chart, the front-page
tile and water-quality alerts. The CSO map, upstream membership (#114), event history (#121) and whole-catchment
monitoring already read River Data Platform (RDP); this change does not recreate them.

Canonical behaviour: requirement **R9** in
[`rdp-cso-water-quality-consumer`](../openspec/changes/rdp-cso-water-quality-consumer/specs/rdp-cso-water-quality-consumer/spec.md).
RDP supplies evidence only. The assessment, its thresholds and alerts are HPP-owned and live here, as RDP's
[consumer handoff](https://github.com/tclare95/river-data-platform/blob/main/docs/CSO-ISHPP-OPEN-CONSUMER-HANDOFF.md) requires.

## What the legacy assessment did, and what is kept

| Legacy element | Product intent | v1 |
| --- | --- | --- |
| Sewage Map `number_CSOs_per_km2` at the information point < 250 m from HPP; its population is "outfalls spilling now or in the last 48 h", counted as D8 raster cells over a raster drainage area | How much upstream storm-overflow activity could be reaching HPP | Count of reviewed upstream outfalls that spilled in the previous 48 h, plus those spilling now. Same 48 h population idea, without the raster occupancy/area arithmetic |
| 3 h rolling mean against trailing-year percentiles (P60 0.0105, P80 0.0258) | "Elevated"/"High" relative to normal | Explicit absolute counts (below). No legacy threshold is reused |
| 4 h river rise at Colwick (0.081/0.101 m, calibrated on 49 samples) | Runoff after rain | Same-time-yesterday comparison (below); the 4 h rule mostly measured Colwick's regulated daily cycle |
| Worst of the two factors; "partial" if one is missing | One understandable indication | Kept, except that river conditions can never stand in for missing overflow evidence |
| Alerts `riskLevel` amber/red on the CSO factor | Email when CSO risk reaches a level | Kept: amber = Elevated, red = High, on the upstream-overflow factor |
| Chart of hourly density with the two reference lines | See the trend | Hourly counts with the reference lines; the legacy density is kept as a separately labelled archive |

## The calculation

Pure and versioned: [`libs/waterQualityAssessment.js`](../libs/waterQualityAssessment.js) (`ASSESSMENT_METHOD`).

**Population.** The confirmed scope of RDP's approved, pinned `hpp-upstream-outfalls` relationship set (592 Severn Trent
outfalls at `bb422e98…`), regardless of `RDP_CSO_MEMBERSHIP`.

**Evidence.** One cached 7-day read of the `hpp-catchment` collection set (`readSetActivity(…, 168)`, walk or summary per
`RDP_CSO_SET_SOURCE`; the same cache as the 7-day event history): each outfall's current status, events and collection
coverage. Colwick levels from `getLatestLevelsSnapshot()` (whichever `RDP_LEVELS_SOURCE` is configured).

**Per outfall at instant T** (`outfallEvidenceAt`):

- *Spilled in the window* `[T − 48 h, T]`: an ongoing event, a provider-reported end inside the window, or an event without
  a reported end that started inside the window. The live point also counts a fresh status where provider-reported and
  effective state are both `spilling`.
- *Did not spill* needs positive evidence: no event in the window, no event whose unknown end could reach into it, no
  truncated event list, and collection coverage over the whole window (a gap opened within 45 minutes of the read is the
  next poll not having run yet). The live point additionally needs a fresh, online, non-contradictory status.
- Anything else is **unknown**: offline or stale monitors, collection gaps, unavailable or unread rows, unresolved event
  ends, truncation, a read window that does not reach back far enough.

**Upstream activity** counts each as bounds: `min` (recorded) and `max` (recorded + unknown), for both "spilled in 48 h" and
"spilling now". Bands (explicit product defaults, see [Decisions](#decisions-needing-product-acceptance)):

| Level | Spilled in previous 48 h | or spilling now |
| --- | --- | --- |
| High | ≥ 60 | ≥ 10 |
| Elevated | ≥ 15 | ≥ 3 |
| Lower | below both | below both |

- Bounds agree: that level (`partial` when anything was unknown).
- Recorded evidence already Elevated/High but unknowns could raise it: that level, `atLeast: true` ("At least elevated").
- Recorded evidence Lower but unknowns could raise it: Lower (partial) only while unknown outfalls are at most 5 % of the
  population; otherwise **Unavailable** ("too many … to rule out higher activity"). Missing evidence is never "no spill".

**River conditions** (`assessRiverConditions`): median Colwick level over the last 6 h minus the median over the same 6 h
a day earlier (≥ 12 readings in each; newest reading ≤ 90 min old, because RDP levels arrive 20–35 min after observation).
Elevated ≥ 0.10 m, High ≥ 0.30 m.

**Overall** = the higher factor. If the overflow factor is unavailable, the overall is Unavailable unless river conditions
alone are Elevated/High (then "at least", partial). If river conditions are unavailable, the overflow level stands, partial.

**History.** Recomputed from the same 7-day read for each hour back to `now − 120 h` (the earliest hour whose whole 48 h
window lies inside the read), plus the live point. Nothing is stored: no new collection, no second writer. Hours without
enough evidence are gaps in the chart, never zero.

### Validation on representative real data

`testUtils/fixtures/rdpWaterQuality-2026-11-16.json` is a compact copy of the public isHPPOpen responses read on
2026-11-16 ~18:15Z (RDP events/coverage for all 592 members, statuses, Colwick levels, and the legacy density for the same
week). [`__tests__/waterQualityAssessment.test.js`](../__tests__/waterQualityAssessment.test.js) asserts:

| Time (UTC) | v1 | Evidence | Legacy density |
| --- | --- | --- | --- |
| before 14 Nov 16:41 | **Unavailable** | RDP collection for the set began 12 Nov 16:41, so no whole 48 h window was covered (≈ 588 unknown) | 0.0004–0.0008 |
| 15 Nov 10:00 | **Lower** | 2–3 outfalls spilled in 48 h; river −0.03…+0.01 m | 0.0005 |
| 15 Nov 16:00 | **Elevated** | rain: 24 spilled, 6–9 spilling | 0.0066 |
| 16 Nov 18:17 (live) | **Elevated** (partial) | 32 spilled (≤ 36: 3 offline monitors, 1 truncated list); river +0.16 m | 0.0087 ("Lower" under the legacy P60 threshold) |

Over the same dry days the old 4 h rule reached High about once a day (Colwick's ±0.1–0.18 m regulated daily cycle); the same-time-yesterday rule stayed within ±0.035 m until the rain arrived.

## Source switch: `RDP_WQ_ASSESSMENT`

Read by [`libs/services/waterQualityAssessmentService.js`](../libs/services/waterQualityAssessmentService.js); independent of
`RDP_CSO_SOURCE`, `RDP_CSO_MEMBERSHIP` and the other RDP switches. Pinned once per alert run.

| Mode | Indication, chart, front page | Alerts | Reads Mongo `waterQuality` |
| --- | --- | --- | --- |
| unset / `legacy` | Legacy density indicator (unchanged numbers), computed on the server | Legacy, unchanged for rules that never saw v1 | yes |
| `shadow` | Legacy, plus `comparison: { legacy, rdp }` on `/api/waterquality/assessment` | Legacy decides; RDP decisions are counted in the run result (`waterQualityShadow`) and logged, never written | yes |
| `rdp` | v1 | v1 ([Alerts](#alerts)) | **no** (also not by `/api/waterquality` in RDP status + RDP membership mode, nor `/api/admin/operational-health`) |
| anything else | legacy (logged) | water-quality rules skipped, `sourceFailures: ["wq-assessment-config"]` | — |

An RDP failure in `rdp` mode is an **Unavailable** assessment (HTTP 200, cached 60 s so it is replaced quickly), never the
legacy density. Roll back by unsetting the variable.

### Public routes

- `GET /api/waterquality/assessment?hours=0|24|120` (new): `{ mode, source, version, current, history, method, explanation,
  evidence, health, sources }` in `rdp` mode; `{ mode, source: "legacy", version: "sewage-map-density/2026-08-31", current,
  history: null, legacyHistory }` otherwise. `current` has the same shape in both: `level`, `label`, `atLeast`, `partial`,
  `reasons`, `observedAt`, `factors`. In both, missing or stale CSO evidence never yields **Lower**: the legacy indicator
  then shows only an elevated or high four-hour river rise, as "at least" that level, and is otherwise **Unavailable**.
- `GET /api/waterquality/csodensity` (unchanged): the legacy density series. With v1 it is only the archive.
- `GET /api/waterquality` (unchanged shape). In RDP status + RDP membership mode with `RDP_WQ_ASSESSMENT=rdp`,
  `NumberCSOsPerKm2` and `NumberUpstreamCSOs` are `null` (not 0), `Id` is null, and `ScrapeTimestamp`/`health` are the RDP
  set read's.

### Website

- The indicator (`components/functional/vomitfactor.js`) renders the server's `current` in every mode; the browser no
  longer computes an indication or reads `/api/levels` for it. The front page tile reads the same route.
- "Activity over time" shows v1 counts per hour with the two reference lines and a shaded interval for what missing
  evidence could add. A switch shows **the archived Sewage Map density** (last 30 days recorded) in its own chart with its
  own scale and thresholds, labelled as a different measure. The two are never drawn on one axis, spliced or converted.
- "How to interpret this indication" states what is measured, the thresholds, what it does **not** mean, how missing
  evidence is treated, the version, and that the legacy history is a different scale. "About the data" attributes Severn
  Trent Water (via RDP), RDP's reviewed relationship set (OpenRiversNetwork) and Environment Agency levels, and says the
  indication is computed by this site, not RDP.

## Alerts

[`libs/alerts/waterQualityAlertDecision.js`](../libs/alerts/waterQualityAlertDecision.js), wired into
`colwickAlertsService.js`. Subscription records (email, `riskLevel`, status, tokens) are never changed by the migration.

- Trigger only on what evidence proves (`lowest` risk ≥ rule); re-arm only when evidence rules the level out (`highest` <
  rule). Unavailable evidence is a skip: no trigger, no re-arm, and `sourceFailures` includes `wq-assessment`.
- **No artificial notifications.** A rule whose state was decided by another assessment (legacy, or none recorded) is
  first *enrolled*: an evaluation marker `wqAssessment: { version, at, lowest, highest, state, transitionId,
  suppressUntilClear }` is written inside the existing `stateRevision` compare-and-set, with no transition. If v1 already
  meets, or cannot rule out, the rule's level, the rule stays quiet until v1 has cleared once; only a later rise notifies.
- The same happens in reverse: in `legacy`/`shadow` mode a rule carrying a v1 marker is re-enrolled on the legacy density
  before legacy can notify. Rules that never saw v1 follow the legacy path exactly as before.
- The marker is detached when another writer changes the condition state (like the gauge markers, #51-D), which forces a
  re-enrol rather than acting on stale state. A released (rejected) delivery keeps it attached.
- Rules created after the switch behave like any armed rule. Delivery, idempotency keys and pending-delivery resume are
  unchanged. No email is sent by the switch itself; nothing is sent artificially to "test" it.
- The alert run reads the RDP assessment only when there is at least one water-quality rule. The cron route now allows
  180 s (a cold 7-day walk is about 70 s; normally a shared cache hit), with a 120 s read deadline.

## Decisions needing product acceptance

These defaults are deliberate and simple; they are not the output of a calibration programme. Changing any of them is a
new assessment version (alerts re-enrol, they do not fire on the change).

1. **Bands**: Elevated at ≥ 15 outfalls spilled in 48 h or ≥ 3 spilling now; High at ≥ 60 or ≥ 10 (≈ 2.5 % and 10 % of the
   592 members). On the November sample, dry days sit at 1–3 and an ordinary rain event reached 32.
2. **48 h window**: kept from Sewage Map's population, to allow for travel time down a 7,500 km² catchment.
3. **5 % unknown tolerance** for showing Lower.
4. **River conditions**: 6 h median vs a day earlier, Elevated ≥ 0.10 m, High ≥ 0.30 m, replacing the 4 h rule.
5. **No distance weighting**: an outfall in the upper Trent counts the same as one at Nottingham. Along-river distance is a
   possible v2 input once RDP offers it per member.

## Retiring the legacy writer

**Writer:** ishppopenScraper, CloudFormation `LambdaFunction` (`rate(15 minutes)`), handler
[`is-hpp-open/app.mjs`](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/app.mjs): the
"handle scraping river quality" block, i.e. `getNWSCDownstreamImpactInfo(mkTimeout(8000))`
([`waterQuality.mjs`](https://github.com/tclare95/ishppopenScraper/blob/main/is-hpp-open-scraper/is-hpp-open/waterQuality.mjs), which
fetches `https://d1kmd884co9q6x.cloudfront.net/downstream_impact/severntrent/severntrent_info_now_incl_48hrs.geojson`) followed
by `createWaterQualityDoc(cachedDb, waterQualityData)`, which inserts into Mongo `waterQuality`.

**Coupling:** the same `waterQualityData.CSO_IDs` feeds `runCsoCollection` (legacy `csoData` polling). Stopping the
summary leaves that ID list empty, which silently stops legacy CSO collection too. Set `CSO_COLLECTION: "disabled"` first
([RDP-CSO-RETIREMENT-68](RDP-CSO-RETIREMENT-68.md) step 5) so each stop is explicit, or switch both off in one release.
The switch belongs in the scraper repository (an env flag in the style of `CSO_COLLECTION`, e.g.
`WATER_QUALITY_SUMMARY: enabled|disabled`, that skips both calls while levels, HPP status and the rest continue).

**After the website no longer needs it** (all in Vercel Production, verified on `/api/waterquality` and
`/api/waterquality/assessment`): `RDP_CSO_SOURCE=rdp`, `RDP_CSO_MEMBERSHIP=rdp`, `RDP_WQ_ASSESSMENT=rdp`. Then no runtime path
reads new `waterQuality` documents:

| Reader | With the three switches |
| --- | --- |
| Indication, front page, chart, alerts, operational health | v1 only |
| `/api/waterquality` | RDP status + membership; legacy density fields null |
| `/api/waterquality/csodensity`, the archive view | historical documents only (kept, never deleted) |
| #114 catchment comparison | historical documents only; an empty recent window is reported as such |
| `legacy`/`shadow` modes, `/api/admin/cso-shadow` | rollback/diagnostics; after the writer stops their density goes stale and is shown **Unavailable**, never as a value |

## Activation sequence

Each step is a separate production action with its own approval.

1. Merge and deploy. Nothing changes (`RDP_WQ_ASSESSMENT` unset).
2. Optional: `RDP_WQ_ASSESSMENT=shadow` for a day. Check `/api/waterquality/assessment` `comparison` and the alert run's
   `waterQualityShadow` (expect `enrol:assessment_changed` for existing rules, no unexpected `trigger`). Not a calibration
   programme: one wet and one dry period is enough to see that the two move together.
3. Accept the [decisions](#decisions-needing-product-acceptance). Set `RDP_WQ_ASSESSMENT=rdp`. Verify the route's
   `source: "rdp"` and `health.state: fresh`, the alert run's `waterQualitySource: "rdp"`, `enrolled` equal to the number of
   active water-quality rules, `sent: 0` from that run, and no `wq-assessment` source failure.
4. Scraper: disable legacy CSO collection (if not already), then the `waterQuality` summary writer (above). Verify no new
   `waterQuality` documents, no CloudFront request in the logs, and that levels, HPP status and schedules continue.

**Rollback:** unset `RDP_WQ_ASSESSMENT` (and re-enable the writer if it was stopped). Rules re-enrol on legacy without
sending; the legacy history is intact.
