# RDP CSO consumer for `/waterquality` (#120)

This change makes River Data Platform (RDP) a usable, reversible source of **current CSO status and
recent event details** for the existing `/waterquality` product. The code ships with the default
`RDP_CSO_SOURCE=legacy`, so merging it changes nothing until the variable is set.

It does **not** change the HPP membership list, the density series or chart, `waterQualityIndicator.js`,
water-quality alert evaluation, Mongo writes or the Node scraper. Membership and density are #114;
retiring the writers is #68.

## Modes

| `RDP_CSO_SOURCE` | `/api/waterquality` | `/api/waterquality/cso`, `/cso/[id]` | RDP reads |
| --- | --- | --- | --- |
| `legacy` (default, unset) | Mongo `waterQuality` + `csoData` | Mongo `csoData` | none; `libs/rdp/csoSource.js` is never loaded |
| `shadow` | legacy, returned unchanged | legacy | bounded, time-limited (8 s); one comparison log line per regeneration |
| `rdp` | RDP status/events over the legacy membership | RDP, legacy record shape | bounded, time-limited (12 s) |
| anything else | legacy, plus an `Invalid RDP_CSO_SOURCE` error log | legacy | none |

The variable is read independently of `RDP_TRENT_SOURCE`, `RDP_LEVELS_SOURCE` and
`RDP_GAUGE_ALERTS_SOURCE`. An invalid value never breaks the other RDP consumers.

Callers that are **not** switched:

- `colwickAlertsService` and `/api/admin/operational-health` call `getLatestWaterQualitySummaryHealth()`
  (summary freshness only, no `csoData` read, #68) in every mode. Alerts therefore keep exactly their current
  inputs (density plus summary freshness).
- `/api/waterquality/csodensity` and the homepage density tile read Mongo `waterQuality` as before.

## Code map

| Piece | File |
| --- | --- |
| Bounded reads: `listCsoOutfalls`, `getCsoStatus`, `getCsoEvents`, `getCsoHealth` | `libs/rdp/client.js` |
| Response validation for the reads above | `libs/rdp/csoContract.js` |
| Identity mapping, caching and coalescing, classification, shadow comparison, diagnostics, `rdp` snapshot | `libs/rdp/csoSource.js` |
| Mode dispatch: `getPublicWaterQualitySnapshot`, `getPublicCsoDetailsByIds/ById` | `libs/services/waterQualityService.js` |
| Protected diagnostic report | `app/api/admin/cso-shadow/route.js` |

### Client bounds

The client refuses the following before it signs or sends anything (`INVALID_QUERY`):

- **Status:** 1–20 unique canonical IDs.
- **Events:** a `[from, to)` window in UTC `Z` form, at most 366 days; `limit` 1–500; a well-formed cursor.
- **Catalogue:** `limit` 1–1000.

Response bodies are capped at 3 MiB and must match `docs/openapi-cso.json` in river-data-platform exactly.
Otherwise the result is `RESPONSE_CONTRACT_ERROR`. Examples of rejected responses:

- reordered or missing status rows;
- a spilling state without a source time;
- an event belonging to another outfall;
- an ongoing event with an end, or a completed provider-reported event without one;
- an unverified page;
- coverage reported as `complete`.

HTTP failures map to fixed codes, and RDP's error text is never kept:

- 403 → `AUTHORIZATION_FAILED`, not retried;
- 404 `ASSET_NOT_FOUND`;
- 409 `CURSOR_STALE`;
- 429 → `THROTTLED`, retried once;
- 503 `STORAGE_UNAVAILABLE`, retried once;
- 503 `ARCHIVE_INTEGRITY`, not retried.

### Identity

The legacy membership is Severn Trent ArcGIS `Id`s (for example `SVT01157`). Each one is matched to an RDP
canonical ID (`severn-trent:<source>:<externalId>`) using the verified catalogue (`GET /v1/cso/outfalls`).
The catalogue is paged at up to 1,000 per page, at most 10 pages, and the restart after `CURSOR_STALE` is
tried once.

- Exactly one Severn Trent asset with that `externalId` → `mapped`.
- No match → `missing`.
- More than one match → `ambiguous`, with the candidates listed in diagnostics.

Assets from other providers are ignored. Nothing is guessed from names or coordinates. Unmapped IDs are
never sent to the status route, because one unknown ID there turns the whole batch into a 404.

### Classification (`rdp` mode)

The public statuses stay `active | recent | offline | unknown`. Every location in `rdp` mode also carries
an additive `statusReason`, so `unknown` never hides the reason for it.

| Evidence | `status` | `statusReason` |
| --- | --- | --- |
| `status=available`, `freshness=fresh`, source time ≤ 30 min old by our clock (5 min future skew), reported **and** effective `spilling` | `active` | `spilling` |
| fresh `not_spilling`, latest event is completed with a provider-reported end in the last 48 h, not held | `recent` | `recently_stopped` |
| fresh `offline` report | `offline` | `offline` |
| stale source time (RDP's view or ours) | `unknown` | `stale` |
| `no_observations` / `unresolved` / `unavailable` row | `unknown` | same as the row |
| reported and effective states disagree | `unknown` | `contradictory` |
| batch failed / not read (budget) | `unknown` | `status_unavailable` / `status_not_read` |
| latest event held / unresolved / end not reported | `unknown` | `event_held` / `event_unresolved` / `event_end_not_reported` |
| events read failed / truncated | `unknown` | `events_unavailable` / `events_truncated` |
| confirmed fresh `not_spilling`, no recent event | `unknown` | `not_spilling_no_recent_event` |
| identity missing / ambiguous | `unknown` | `identity_missing` / `identity_ambiguous` |

`not_spilling_no_recent_event` is reported as `unknown` because that is what legacy does for a fresh
`Status 0` record without a recent end. The page has no "clear" state, and adding one is a separate
product decision. `statusReason` keeps it distinguishable from stale or failed data.

Timestamps come from the source:

- `latestEventStart` is the ongoing event's `startedAt`, falling back to the provider `StatusStart`.
- `latestEventEnd` is only a provider-reported `endedAt`. It is never `endNoLaterThan`, and never a fetch time.
- `sourceUpdatedAt` is the provider `LastUpdated`.
- `observedAt` is RDP's `fetchedAt`, the analogue of legacy `DateScraped`.

### Detail routes (`rdp` mode)

These return the legacy record shape (`Id`, `Status`, `StatusStart`, `LatestEventStart`, `LatestEventEnd`,
`LastUpdated`, `ReceivingWaterCourse`, `DateScraped`, `Coordinates`).

`Status` is set as follows:

- `1` for an active location;
- `-1` for a fresh offline report;
- `0` only for a fresh, confirmed `not_spilling`;
- otherwise `null`, never `0`.

Other limits in this mode:

- Unmapped IDs are omitted, just as an ID without `csoData` is omitted in legacy.
- A request may name at most 20 IDs; more gives 400.
- A total RDP failure gives 503, with no fallback.

### `rdp` mode health and fallback

`health` keeps the legacy shape, with `source: "river-data-platform-cso"`. Its state is computed from the
membership summary's `scrape_timestamp`, so a stale membership shows as `stale`. It also carries
`cso: { origin: "rdp", partial, unknown }`.

If the catalogue read fails, or every status batch fails, current status is reported as **unavailable**
(superseded by [#68](RDP-CSO-RETIREMENT-68.md)): every member is `unknown` with `statusReason: "rdp_unavailable"`,
spill/recent counts are `null`, health has `state: "unavailable"` and `cso: { origin: "rdp", available: false, rdpError }`.
Nothing falls back to Mongo `csoData`, and sources are never mixed per location.

### Request budget and caching

| Read | Cache (`unstable_cache`, failures not cached) | Per regeneration |
| --- | --- | --- |
| Catalogue | 6 h | ≤ 10 pages, normally 3 |
| Status | 5 min, key = sorted batch | ⌈members / 20⌉, members capped at 60 |
| Events | 15 min, window aligned to 15-min buckets | one window per fresh mapped member, ≤ 20 members, ≤ 3 pages each, concurrency 4 |
| Health | 15 min | diagnostics only, ≤ 20 |

Concurrent cache misses in one instance coalesce into a single in-flight read. Members over a budget are
listed in `budget.skipped` and classified `status_not_read`; they are never assumed clear. The browser only
calls `/api/waterquality` (revalidate 900 s), so a page view never causes per-marker RDP reads.

## Diagnostic report

`GET /api/admin/cso-shadow` requires a signed-in session (`requireRouteSession`, 401 otherwise). It is
read-only, available in **every** mode, and recomputed on each call through the same caches.

The response contains:

- `legacy`: summary ID, scrape time, health and counts.
- `rdp`: `ok`, `error`, per-stage `failures` (catalogue, status, events, health, deadline), `budget`, the
  catalogue states, and the event window.
- `summary`:
  - `outcomes`: `match`, `status_mismatch`, `event_mismatch`, `not_comparable`, `identity_missing`,
    `identity_ambiguous`, `rdp_failed`;
  - `rdpReasons`;
  - `unknowns`;
  - `sourceLagSeconds` (median, max absolute, sample count);
  - `rdpSourceAgeSeconds`;
  - `notSelectedForPolling`.
- `locations[]`: per member, the legacy and RDP status, the RDP reported, effective and freshness states,
  both source times, `sourceLagSeconds`, coverage, health, `selected`, and `eventDiffs` when present.

A pair is compared only when both source reports (`LastUpdated` and RDP `sourceUpdatedAt`) are within
15 minutes of each other (one RDP poll). Otherwise the outcome is `not_comparable` and the lag is reported.
A disagreement is evidence to review, not proof that either side is right.

## Missing production read permissions (checked 2026-11-12, read-only)

| Layer | State | Needed for |
| --- | --- | --- |
| RDP production stage `cso_read` | `true` in `deploy/stages/production.json` on RDP main | routes exist |
| Production caller role `river-data-platform-production-vercel-production`, inline policy `ProductionObservationReads` | allows only `GET/v1/measurements*` and `GET/v1/river/*`. **No `GET/v1/cso/*` resources.** | **every** CSO read from Vercel Production. Until it is granted, shadow logs and the admin report show `AUTHORIZATION_FAILED`, and `rdp` mode falls back to legacy |
| Staging caller role / `cso_read` | `cso_read: false` and CSO storage off on staging | Preview deployments cannot exercise CSO reads at all |

The production grant is an RDP-owned, reviewed change: `deploy/read_api_iam.py --stage production --cso`
redeploys the caller stack with the six CSO GET resources (`outfalls`, `outfalls/status`,
`outfalls/*/events`, `outfalls/*/health`, `events/*`, `events/*/revisions`). This PR does not make that
change. A signed production smoke run should then confirm:

- the path form `.../outfalls/severn-trent:<source>:<id>/events`, with a raw `:` signed as `%3A`, matching
  RDP's `read_api_smoke.py`;
- the selected HPP IDs.

## Shadow activation procedure

Each step is a separate, explicit action.

1. **Prerequisite (RDP):** grant the production caller the CSO routes, as above, and record a signed smoke
   run against the four HPP-selected IDs (`SVT01157`, `SVT01294`, `SVT02056`, `SVT02180`).
2. **Baseline, still `legacy`:** while signed in, call `GET /api/admin/cso-shadow` on Production. Expect
   `rdp.ok: true`.
   - Record `identity` outcomes. Any `missing` or `ambiguous` result is a producer or catalogue question.
   - Record `notSelectedForPolling`. Legacy members that RDP does not poll show as `no_observations`.
3. **Enable shadow:** set `RDP_CSO_SOURCE=shadow` for **Production only** in Vercel, then redeploy. Vercel
   environment changes apply to new deployments. Public output is unchanged by construction.
4. **Observe for at least 7 days**, including at least one wet-weather spill:
   - search the runtime logs for `RDP CSO shadow comparison`;
   - capture the admin report at least daily and during spills.

   Track:
   - `status_mismatch` and `event_mismatch` counts;
   - the `not_comparable` rate and source-lag distribution;
   - `unknown` reasons;
   - read failures (403, 429, 503, timeouts);
   - coverage gaps.
5. **Parity review:** write up the evidence in #120. For every mismatch, explain which source was right.
   Then get explicit approval before step 6.
6. **(Gated, not authorised by this PR)** Set `RDP_CSO_SOURCE=rdp` and redeploy. Check `/api/waterquality`:
   - `health.source` is `river-data-platform-cso` and `health.cso.origin` is `rdp`;
   - counts and markers match the latest admin report.

## Rollback

- **From `shadow` or `rdp`:** set `RDP_CSO_SOURCE=legacy`, or delete it, then redeploy. Alternatively,
  promote the previous Production deployment with "Instant Rollback", which keeps that deployment's
  environment.
- **Nothing to undo in data:** no isHPPOpen state, Mongo document, alert or subscription is written in any
  mode.
- **Alerts:** never switched, so they need no rollback.
- **Catalogue caches:** the data caches are tagged `rdp-cso` and expire within 6 h. `legacy` mode never
  reads them.

## Tests

- `__tests__/rdpCsoClient.test.js`: bounds, contracts, pagination parameters, 403/404/409/429/503
  handling and size limits.
- `__tests__/rdpCsoSource.test.js` covers:
  - classification: fresh, stale and future times; offline, unresolved and unavailable rows;
    contradictory states; recent ends and the 48 h boundary; held, unresolved and end-not-reported
    events; empty, failed and truncated events;
  - ambiguous and missing identities;
  - pagination, batching, partial and total failure, catalogue restart, coalescing;
  - the `rdp` snapshot shape compared with legacy, fallback, and the detail shape;
  - shadow: unchanged output, a deadline on hangs, outcome classes;
  - the diagnostic report;
  - mode switching, including that alerts stay on legacy.
- `__tests__/api/waterquality-api.test.js` and `__tests__/api/cso-shadow-api.test.js`: route compatibility,
  error mapping and authentication.
