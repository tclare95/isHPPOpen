# RDP Trent dashboard adaptation (#51-B)

Implements section B of [unify-gauge-consumers](../openspec/changes/unify-gauge-consumers/tasks.md)
on top of the [#51-A client](RDP-CLIENT-51A.md). The consumer is `/api/trentweirs`;
the producer is RDP's read API. The scraper, predictor and RDP repositories are
unchanged. **Every deployed target stays `RDP_TRENT_SOURCE=legacy`.** This slice
adds no Vercel setting, deployment, AWS change or production cutover.

## Modes

`getTrentWeirsSnapshot()` reads only `RDP_TRENT_SOURCE`, independently of the
levels and alerts keys. If it's absent it is `legacy`. An invalid value logs an
error and serves legacy. The default path never imports `libs/rdp/`.

| Mode | Served data | RDP reads | Side effects |
| --- | --- | --- | --- |
| `legacy` | Existing EA snapshot | None | None |
| `shadow` | The legacy result object, unchanged | Six bounded histories, concurrent with legacy | One log line per snapshot |
| `rdp` | Per-series RDP, else fresh validated legacy, else stale | Six bounded histories | Degraded-series log line |

Gauge alerts call `getLegacyTrentWeirsSnapshot()` directly, so no Trent mode
changes alert inputs. Slice D owns `RDP_GAUGE_ALERTS_SOURCE`. The admin
operational-health check uses the display path, so it reports what the dashboard serves.

## Contract preservation

- **Output:** `{ok:true,data:{generatedAt,fallback,partial,stations,health}}`. The
  stations are in the same order (Colwick, Clifton Bridge, Shardlow, Church Wilne,
  Kegworth) and Shardlow's measures stay `level` then `flow`. Each series is the
  newest 672 readings, newest first, with EA-format `dateTime` (`…:00Z`).
  A test asserts that identical source data gives `stations` deep-equal to legacy.
- **Calculations:** RDP readings go through the same `buildMeasureSnapshot`. Rates
  use index 4 (1h) and index 96 (1d), level is in cm and flow in m³/s, and values
  are rounded to one decimal place. Missing-sample behaviour is deliberately unchanged.
- **Additive diagnostics (rdp mode only):** `health.source` is
  `river-data-platform-trent`, and `health.series[]` lists `{key, origin:
  rdp|legacy|cache|null, state: fresh|stale|unavailable, observedAt, ageSeconds}`.
  RDP error codes, cursors, URLs and envelopes are only logged server-side, never returned.

## Bounded pagination

Each measurement gets one UTC window `[now-7d, now]`, with `limit=1000` and at most
3 pages (normally 1, since 7 days is 672 rows). Opaque cursors are passed through
unchanged. If the bound is hit, the series fails with `PAGINATION_LIMIT`, because
it's incomplete and the newest rows were not reached. Rows must strictly ascend
across pages, so duplicates or reversals fail with `RESPONSE_CONTRACT_ERROR`.
The A client already validates identity, unit, datum, provider measure and page
integrity. Each series has a 10s display deadline, so one slow measurement can't hold the response.

## Display fallback and honest health

Selection is per complete series, and RDP and EA points are never mixed:

1. Use a fresh RDP series (newest observation ≤ 30 minutes old).
2. Otherwise fetch the series' legacy EA readings (same URL/900s fetch cache as
   legacy). Accept them only if every item is the exact provider measure
   (`…/measures/<providerMeasureId>`, which also fixes the unit), every value and
   time is finite, times strictly descend, and no quality is
   `Suspect|Rejected|Missing`. Use them if fresh.
3. Otherwise serve the newest of stale RDP, stale legacy, or this instance's
   last-known series (`cache`), reported `stale`. If none exists, the series is
   missing and `partial: true`.

A failed series doesn't suppress healthy ones. Unlike legacy mode, a station is
kept with only the measures that succeeded. If no series succeeds, the service
throws and the route returns its existing empty `unavailable` payload.

Health in rdp mode takes its age from the **oldest** served series, so one stale
series makes the snapshot `stale`. `buildOperationalHealth` now ranks `stale`
above `fallback` (it is still below `unavailable`). The legacy in-process
saved snapshot now recomputes its health when it is served. Before this, it kept
the `fresh` state from when it was saved. Only Trent passes `fallback`, so other
sources are unaffected. A side effect is that legacy gauge alerts (which require
`fresh`) now skip saved Trent data instead of evaluating it as fresh.

## Caching

The route keeps `revalidate = 900`. The A client fetches with `cache: "no-store"`,
and in Next.js 16 that would mark the route dynamic, which would remove the 15-minute
cache and fan out to RDP on every request. Next skips that marking inside an
`unstable_cache` scope (`markCurrentScopeAsDynamic`). So history reads go through
`unstable_cache(["rdp-trent-history-v1"], {revalidate: 900, tags:
["rdp-trent-history"]})`. That matches the legacy EA fetch's 900s data cache.
Failed reads aren't cached, and only public observations are stored. Builds in
both `legacy` and `rdp` (fail-closed config) modes still list `/api/trentweirs`
as `○ 15m`. Worst-case age is still about the route cache plus the data cache,
the same as legacy.

## Shadow comparison

For each series, `compareTrentSeries` compares values **only at exact equal
observed timestamps**, using representational (epsilon) equality and no other
tolerance. It reports these separately:

- `matched`, `valueMismatches` and up to 3 `mismatchSamples`
- `missingInRdp` and `missingInLegacy`, counted only inside the overlapping window
  so that window-edge differences are not counted as gaps
- `latestLagSeconds`, where a positive value means RDP is behind
- freshness on each side, the `rdpError` code, and legacy versus RDP 1h/1d rates

Status precedence is `rdp_error|rdp_missing|legacy_missing` → `value_mismatch`
→ `no_overlap` → `gaps` → `lag` → `match`. Fetch-time differences are never
conflicts. The RDP side cannot reject, and a comparison failure logs a fixed line.
A legacy failure is rethrown exactly as in legacy mode.

Log line: `[…] [GET] [rdp/trent-shadow] RDP Trent shadow comparison {json}`.
Sampling follows route regeneration, which is about once per 15 minutes per region,
plus admin health checks.

### 48-hour review and 7-day sample (gate for 2.4, not yet run)

Prerequisites: #52 publishes all six IDs (three are still reserved), #69 is live,
Preview function-runtime federation is proven, and the activation is approved.

1. Get approval for a Preview deployment with `RDP_TRENT_SOURCE=shadow` and the A
   Preview variables. Record the deployment ID and SHA.
2. Over at least 48h, export the shadow log lines. For each series, require
   `value_mismatch` = 0 with no unexplained cause, identity/availability for all
   six, typical `latestLagSeconds` ≤ 900 and no
   `AUTHORIZATION_FAILED|AUTHENTICATION_FAILED|RESPONSE_CONTRACT_ERROR|ARCHIVE_INTEGRITY`.
   Classify `gaps` as EA outage, RDP ingest gap or cache difference, and record
   exceptions instead of requiring perfect continuity.
3. 7-day sample: each comparison already spans the full 672-point window. Keep at
   least one complete snapshot per day. Fixture parity is in `__tests__/rdpTrent.test.js`.
4. Attach the summary to #51.

## Activation and rollback (approval-gated)

To activate, an operator changes the Production `RDP_TRENT_SOURCE` and redeploys.
That needs a separate production RDP approval. To roll back, set it to `legacy`
and redeploy. Expect up to about 900s of previously cached responses, plus up to
900s of data cache. The legacy EA fetch cache is shared and stays warm in rdp mode
only for series that fell back. Other consumers are untouched. Health reports the
data actually served, not the desired mode.

## Evidence

Local, 27 October 2026: 32 new tests in `__tests__/rdpTrent.test.js` passed, and
the full Jest run passed (45 suites, 284 tests). ESLint showed 0 errors and the 9
existing warnings. `next build` passed with the CI dummy settings, both as default
and with `RDP_TRENT_SOURCE=rdp` (no Vercel env, so `CONFIGURATION_ERROR` →
all-legacy fallback). Both builds listed `/api/trentweirs` as `○ 15m`. Not
claimed: live RDP reads, function-runtime federation, six-series publication,
shadow parity or rollback evidence.
