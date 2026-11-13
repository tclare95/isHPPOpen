# RDP as the CSO status source and legacy CSO collection retirement (#68)

This makes River Data Platform (RDP) the normal source of current CSO status and events for `/waterquality`.
It also retires the legacy collection: Severn Trent ArcGIS → SQS → Node `CsoWorkerFunction` → Mongo `csoData`.
It builds on [#120](RDP-CSO-120.md) (`RDP_CSO_SOURCE`), [#121](RDP-CSO-HISTORY-121.md) (event history) and
[#114](RDP-CSO-CATCHMENT-114.md) (whole-catchment monitoring). Canonical behaviour is requirement R7 in
[`rdp-cso-water-quality-consumer`](../openspec/changes/rdp-cso-water-quality-consumer/specs/rdp-cso-water-quality-consumer/spec.md).

Production state when this was written (2026-11-13, read-only checks):

- `RDP_CSO_SOURCE` is **not set** in Vercel Production, so the site serves `legacy`.
- `/api/waterquality` reports `health.source: mongodb-water-quality`.
- `RDP_CSO_HISTORY` and `RDP_CSO_CATCHMENT` are set.
- The #120 shadow observation and parity review have **not** been run in Production.

## What changes in code (this PR)

| Area | Before | After |
| --- | --- | --- |
| `rdp` mode, RDP fully unavailable (catalogue failed, every status batch failed, or 12 s deadline) | Whole legacy `csoData` snapshot, `health.state: fallback` | No Mongo `csoData` read. Every member is `unknown` with `statusReason: "rdp_unavailable"`. `currentlySpilling`, `recentlyStopped48h`, `offline`, `ActiveCSOCount` and `CSOActiveTime` are `null`. `health.state: unavailable` with `cso: { origin: "rdp", available: false, rdpError }` |
| `rdp` mode, RDP available | RDP status/events (unchanged) | Unchanged, plus `health.cso.available: true` |
| `/waterquality` page and map | Showed counts | When `health.cso.available === false`: "Current CSO status is temporarily unavailable". No count cards, and no location shown as spilling or clear |
| Water-quality alerts, `/api/admin/operational-health` | Legacy snapshot, which reads `csoData` | `getLatestWaterQualitySummaryHealth()`: summary identity and freshness only, in every mode. Alert inputs are unchanged (density plus summary freshness) |
| Catchment comparison (#114) | A `csoData` failure hid the whole comparison | Legacy status history is optional. The density comparison still runs. `legacyStatusHistory.state` is `available`, `none` or `unavailable`. When it is not `available`, `memberAgreement` and the per-row `members.reporting`/`spilling` are `null` |

The response stays `200` during an RDP outage, deliberately. A thrown error would make the route cache keep serving
the previous snapshot as if it were current. The unavailable payload replaces it within one cache period
(900 s), and recovery does the same.

The `legacy` and `shadow` modes and `/api/admin/cso-shadow` still read `csoData`. They are the rollback path and the
parity diagnostic, not ordinary RDP-mode reads. Once collection stops, legacy records age out of the 30-minute
freshness window, so a `legacy`-mode page shows them as `unknown` (stale), never as clear. The shadow report then
shows `not_comparable`.

The public routes, field names, markers, source timestamps (`sourceUpdatedAt` = provider `LastUpdated`,
`observedAt` = RDP `fetchedAt`) and event details are unchanged. `/api/waterquality/cso*` in `rdp` mode already reads
only RDP, returning 503 on total failure.

## Remaining `csoData` dependencies

| Reader | After this PR |
| --- | --- |
| `/api/waterquality`, `/cso`, `/cso/[id]` in `rdp` mode | none |
| Alerts cron, operational health | none |
| Event history (#121) | none (it reads RDP and the membership summary only) |
| Catchment comparison (#114) | optional; absence is reported, not required |
| `legacy`/`shadow` modes, `/api/admin/cso-shadow` | rollback and diagnostics only |
| `scripts/create-water-quality-indexes.mjs` | index maintenance only; harmless |

The `waterQuality` summary (membership `CSO_IDs` and Sewage Map density) is still written by the Node main schedule.
It still feeds density, the indicator, alerts and the RDP membership. It is **not** retired here.

## Activation and retirement sequence

Each step is a separate, explicit production action with its own approval. Do not combine steps.

1. **Merge and deploy this PR.** Production remains `legacy`, so there is no public change.
2. **Scraper release 1:** [ishppopenScraper `CSO_COLLECTION` switch](https://github.com/tclare95/ishppopenScraper/blob/main/DEPLOYMENT.md#legacy-cso-collection-retirement-ishppopen-68),
   explicitly `enabled`. No behaviour change.
3. **Shadow and parity:** follow [RDP-CSO-120 shadow activation](RDP-CSO-120.md#shadow-activation-procedure):
   - set `RDP_CSO_SOURCE=shadow` for Production;
   - observe for at least 48 hours, and until at least one member spill has been seen to start and stop;
   - write up the parity review in #120 and get approval. The bar is the same story (spilling vs not, the same
     spills), not exact timing; see [step 5 there](RDP-CSO-120.md#shadow-activation-procedure).
4. **Activate RDP reads:** set `RDP_CSO_SOURCE=rdp` for Production and redeploy. On `/api/waterquality`, verify:
   - `health.source = river-data-platform-cso`;
   - `health.cso.origin = rdp` and `health.cso.available = true`;
   - counts and markers match `/api/admin/cso-shadow`.

   On `/api/waterquality/cso?ids=…`, verify the legacy record shape. Verify that alerts and the homepage density tile
   are unchanged.
5. **Scraper release 2:** set `CSO_COLLECTION: "disabled"`. Precondition: step 4 has been verified for at least 72 h,
   with the admin report still comparing RDP against legacy and showing no new unexplained disagreement.
   Verify:
   - no new `csoData` records;
   - no Severn Trent ArcGIS requests;
   - `waterQuality`, levels, forecasts and HPP status still advance.
6. **Scraper release 3:** disable the SQS event-source mapping and the weekly archiver. Precondition: `CsoQueue` is
   drained. This is a modify-only change set.

Existing Mongo `csoData` records, `waterQuality` history and S3 `cso-archive/` objects are never deleted. Disabling the
archiver also stops its copy-then-delete of records older than three months.

## RDP failure handling

| RDP condition | Public result |
| --- | --- |
| Healthy | RDP classification (#120): `active`/`recent`/`offline`/`unknown` with `statusReason` |
| Partial (some batches, event reads or budget) | Affected members are `unknown` (`status_unavailable`, `events_unavailable`, `status_not_read`, …). `health.cso.partial: true` |
| Unavailable | The unavailable payload above. The page says status is unavailable |
| Membership summary stale | `health.state: stale`. Statuses are still RDP's own per-member freshness |

Nothing in any of these cases becomes a confident "not spilling". A fresh `not_spilling` without a recent provider-reported
end is `unknown`/`not_spilling_no_recent_event`, as before.

## Rollback

| From | Action | Replays or duplicate notifications |
| --- | --- | --- |
| Step 4 (`rdp`), collection still running | Set `RDP_CSO_SOURCE=legacy` (or delete it) and redeploy, or use Instant Rollback | None: no state, alert or subscription is written in any mode |
| Step 5 (collection stopped) | Revert scraper release 2 to `enabled` first. After one run (about 15 min) `csoData` is fresh, then set `RDP_CSO_SOURCE=legacy` | None: collection resumes from the provider's current status, with no backfill and no event replay |
| Step 6 (worker/archiver disabled) | Revert scraper release 3, then release 2, then the web variable, in that order | None: the queue is empty when the worker is re-enabled |
| This PR | Revert it. `rdp` mode then falls back to legacy again, so only do this while collection is running | None |

Water-quality alerts never read `csoData` and use the same inputs in every mode, so no rollback step re-evaluates or
resends them. RDP's own event history (#121) is unaffected by any of these steps.

## Tests

- `__tests__/rdpCsoSource.test.js`:
  - total failure and a deadline hang produce the unavailable payload and never read `csoData`;
  - an available read never touches `csoData`;
  - the summary health read is `csoData`-free in every mode.
- `__tests__/rdpCsoCatchment.test.js`: a failed or empty legacy status history keeps the density comparison and reports
  the per-outfall comparison as unavailable.
- `__tests__/waterQualityPage.test.js`, `__tests__/csoMap.test.js`: the unavailable state hides counts and never labels
  a location spilling or clear.
- Alert and operational-health suites mock the summary-only read.
