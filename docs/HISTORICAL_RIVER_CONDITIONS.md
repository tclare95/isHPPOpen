# Historical river conditions (#104)

Implementation of the [historical-river-conditions OpenSpec](../openspec/changes/historical-river-conditions/specs/historical-river-conditions/spec.md).
Visitors can explore observed Colwick river levels since 2016 at `/history`, see time at or above HPP's
2.2 m level rule, and compare periods with past seasons. The home page shows a compact, measured
summary instead of the former hard-coded closure tables.

**These are river-level conditions, not HPP closures.** Nothing here reads or writes `openIndicator`,
replays transitions, changes the HPP rule, alters alerts or live level/forecast APIs, or touches RDP
ingestion, AWS or production data.

## Source

| Item | Value |
| --- | --- |
| Measurement | RDP `ea-colwick-level` (EA station 4009, `4009-level-stage-i-15_min-mASD`), mASD / ASD |
| Read | `GET /v1/measurements/ea-colwick-level/observations` through the existing server-only signed client (`libs/rdp/client.js`); no new IAM, endpoint or browser credentials |
| Rule boundary | Imported from `HPP_RULE_V1` (`libs/hpp/hppDecision.js`): below 2.2 m = below threshold; at or above = threshold met |
| History | Production RDP holds Colwick 2016-01-01 → 2026-01-01 imported from EA Hydrology (350,688 rows, all `Good`, some provider-`Edited`; [RDP #39](https://github.com/tclare95/river-data-platform/pull/39)) plus live flood-monitoring collection since 2026. Periods in between return no rows and are shown as "no observations", never as zero level. |
| Coverage | RDP `coverage.json` is `[]`, so every window reports `coverage.status = "unknown"`. The UI says formal completeness is not confirmed, and would show `partial`/`complete` and listed gaps if RDP publishes them. |

## Architecture

```text
browser ── /history (client) ──┬─ /api/history/colwick/month?year&month   raw readings + day stats
                               ├─ /api/history/colwick/year?year          day stats for 12 months
                               ├─ /api/history/colwick/overview           year-on-year + seasonal context
                               └─ /api/levels (existing, unchanged)       today's live level
        │
libs/history/historyService.js (server-only)
   └─ one bounded RDP read per UK calendar month, unstable_cache'd
        ├─ completed months: revalidate 24–29h  ├─ current month: 15 min
        ├─ at most 2 RDP month reads in flight per instance (incl. background revalidation)
        └─ digest-only layer for year/overview composition (no raw readings)
libs/history/{ukCalendar,quality,digest,aggregate,present}.js — pure, unit-tested
```

- **Bounded reads.** A month is read as `[local midnight − 30 min, next local midnight + 30 min)` (≈2,980 rows,
  one 5,000-row page). At most 4 pages; more fails with `PAGINATION_LIMIT` rather than truncating.
  `CURSOR_EXPIRED`/`CURSOR_STALE` restart the read once. Duplicate, out-of-order or out-of-window rows fail
  the month (`RESPONSE_CONTRACT_ERROR`). Requests never ask for future time.
- **Composition.** Year = 12 cached months; overview = every month since 2016 (~130), at concurrency 4. The
  overview stops starting new reads after 40 s (route `maxDuration` 60 s): unread months are reported as
  failed, the response is CDN-cached for only 60 s, and months already read stay cached, so a cold build
  completes over a few requests. Measured locally over the full 2016–2026 fixture set: ~0.8 s of compute,
  ~100 KB overview payload.
- **Polite revalidation.** `unstable_cache` serves a stale month at once and refreshes it in the background,
  outside the concurrency-4 composition limit. On 2026-11-06 every month filled the previous evening expired
  together and ~500 requests hit RDP in one minute (5 req/s gateway limit: 429s and Lambda throttles). So
  every RDP month read, foreground or background, now passes one per-instance gate
  (`HISTORY_RDP_READ_CONCURRENCY = 2`); concurrent reads of the same month share one call; and completed
  months are spread over six TTLs (24h … 29h, by month) with unchanged cache key parts, so expiry drifts apart.
- **CDN.** `Cache-Control: public, s-maxage=3600` (completed), `900` (in progress), `60` (any month failed),
  each with `stale-while-revalidate=86400`.
- **Failures** map to fixed public reasons (no raw errors): `integrity` (503, `ARCHIVE_INTEGRITY`),
  `temporary` (503: storage, timeout, throttling, cursor, deadline), `unavailable` (503: configuration or
  authorisation — e.g. local dev without OIDC), `unreliable` (502: contract or pagination). The UI shows
  "Read failed" distinctly from "No observations". Year/overview keep readable months and mark failed ones.
- **Isolation.** History components fetch independently; a history failure never affects live status,
  forecast or alerts (tested on the home page status area).

## Evidence rules

### Reading eligibility (`libs/history/quality.js`)

| RDP `quality` | Class | Use |
| --- | --- | --- |
| Hydrology `{"quality":"Good"}` | qualified | Summaries and seasonal baselines |
| Hydrology `{"qcode":"Edited","quality":"Good"}` | qualified, flagged edited | As above; edited count shown |
| `null` (live telemetry), `Unchecked`, `Estimated` | provisional | Shown (dashed) and summarised with a notice; never a seasonal baseline |
| `Suspect`, `Missing`, `Rejected`, unknown or unreadable | excluded | Counted; treated as a gap |

Rows whose `revision > 1` are counted as revised. History shows today's canonical values, which may differ
from what was displayed live at the time.

### Time at or above 2.2 m (`libs/history/digest.js`)

- Readings are instants. Between consecutive eligible readings **at most 30 minutes apart** (two expected
  intervals, RDP's freshness definition), the first half of the interval takes the earlier reading's side of
  the threshold and the second half the later one's. No level is interpolated.
- Longer gaps, excluded readings and time before the first / after the latest reading are **unknown**.
- Time after "now" has not elapsed and is outside the denominator.
- Percentages are always "of supported observed time". Support tiers: `full` ≥ 98% of elapsed time, `partial`
  ≥ 50% (shown with a warning), `limited` < 50% (percentage withheld), `none`.
- "Days reaching 2.2 m" counts UK days with any eligible reading at or above 2.2 m.
- Calendar periods and day labels use Europe/London; reads and maths use UTC instants. DST days are 23/25 h.

Tests cover threshold equality, midpoint crossings, the 30/31-minute boundary, variable cadence, excluded
rows, edges, in-progress months, DST days, GMT/BST month boundaries, pagination, cursor restarts, duplicates,
out-of-order rows and archive integrity failures.

### Seasonal context (`libs/history/aggregate.js`)

- A year-month is reference evidence only if it is completed, has no provisional readings and qualified
  readings support ≥ 90% of it. Excluded years are listed with their reason.
- Percentiles/labels need **≥ 5** reference years; otherwise the UI says the comparison is unavailable.
- Monthly distributions pool 1 cm histograms of qualified readings; the current level's position uses p10 /
  p25 / p75 / p90 ("much lower", "lower", "typical", "higher", "much higher than usual"). "Record" or
  "normal" claims are never made. A month's rank among other qualified years is shown only for fully
  supported months.
- The chart band is the 10th–90th percentile (and median) of daily means within ±7 days of each calendar day.

## Replacing the hard-coded home page tables

The tables in `statusarea.js` (yearly closure days 2012–2026, monthly closure days and percentages) had no
recorded provenance. They were reconciled against the same EA Hydrology Colwick series RDP imported, using
this implementation's digest code (`scripts/fetch-history-fixtures.mjs`):

| Year | Hard-coded "closure days" | Days with any reading ≥ 2.2 m | Time ≥ 2.2 m |
| --- | ---: | ---: | ---: |
| 2016 | 49 | 50 | 40.8 days (11.2%) |
| 2017 | 28 | 29 | 20.3 days (5.6%) |
| 2018 | 46 | 46 | 38.9 days (10.7%) |
| 2019 | 101 | 102 | 91.3 days (25.0%) |
| 2020 | 71 | 69 | 60.4 days (16.5%) |
| 2021 | 50 | 54 | 45.3 days (12.4%) |
| 2022 | 44 | 47 | 32.7 days (9.0%) |
| 2023 | 95 | 99 | 86.2 days (23.6%) |
| 2024 | 103 | 111 | 93.1 days (25.4%) |
| 2025 | 58 | 58 | 46.9 days (12.8%) |
| 2026 | 41 | — | RDP has no Colwick history for Jan → early Sep 2026; shown as limited data |

| Month | Hard-coded % | Share of supported time ≥ 2.2 m, 2016–2025 |
| --- | ---: | ---: |
| Jan | 43.3 | 32.2 |
| Feb | 35.1 | 26.1 |
| Mar | 25.8 | 26.2 |
| Apr | 9.0 | 9.0 |
| May | 1.2 | 1.2 |
| Jun | 3.6 | 3.4 |
| Jul | 0.7 | 0.1 |
| Aug | 1.7 | 1.6 |
| Sep | 2.3 | 2.3 |
| Oct | 14.1 | 14.2 |
| Nov | 27.2 | 25.6 |
| Dec | 42.9 | 41.1 |

The old yearly figures behave like level-derived "days reaching 2.2 m" (exact for 2018/2025, within 1–8
days otherwise) and March–December percentages agree within ~2 points. January/February differ by ~9–10
points, consistent with the legacy figures pooling 2012–2026 whole days. The replacement is therefore
justified: it shows the same kind of figure with stated period, denominator and source, labelled as
level conditions. Pre-2016 figures are dropped until RDP holds reviewed pre-2016 history.

The rolling 7/28/182-day figures on the home page still come from `/api/hppstatus` (recorded HPP status
changes) and are unchanged.

## Product decisions (not specified in the OpenSpec)

1. **Default view** — the latest *completed* calendar year (fully supported), with "Today in context" above it.
   Alternative: the current month (often in progress/provisional). Recommended and implemented: completed year.
2. **Pre-2016 home page figures** — dropped rather than kept as unattributed numbers. Alternative: keep the
   2012–2015 rows labelled "legacy, unverified". Recommended: drop; re-add from RDP if older years are imported.
3. **Provisional live readings** — included in period summaries with a notice and dashed line, excluded from
   baselines. Alternative: hide them. Recommended: include, because recent months would otherwise be empty.
4. **Reference years** — all completed eligible years from 2016 (currently 2016–2025), growing automatically.
   Alternative: a fixed climatology window. Recommended: automatic, as years are always listed.

## Local development

The RDP client needs Vercel OIDC federation, so it cannot run locally. For UI work:

```bash
npm run history:fixtures -- --live-from 2026-09-07T00:00:00Z   # public EA Hydrology → .history-fixtures/ (gitignored)
HISTORY_DEV_FIXTURE_DIR=.history-fixtures npm run dev           # then open /history
```

The fixture reader is active only when `NODE_ENV=development` and `HISTORY_DEV_FIXTURE_DIR` is set; it mimics
RDP's response shape and unknown coverage. `--live-from` imitates production: final-year rows before that
instant are omitted and later rows become provisional live telemetry.

## Remaining limitations and verification

- **Production read not yet exercised.** Production history reads need the deployed Vercel identity; this was
  not run locally or deployed. After a preview/production deploy (separately approved), check
  `/api/history/colwick/month?year=2024&month=11` returns `readings.returned = 2880`, `coverage.status =
  "unknown"`, and that the overview's first cold build completes within a few requests. Preview reads RDP
  staging, which holds no imported history, so preview `/history` mostly shows "no observations".
- **Coverage** stays "unknown" until a reviewed RDP coverage inventory (#69) is published.
- **Throttling.** A cold overview issues ~130 month reads at concurrency 4 against a 5 rps / burst 10 gateway
  throttle; throttled months retry once and otherwise appear as "not yet loaded" for 60 s.
- Only Colwick is in scope; multi-gauge comparison is separate. High-water events (#105) build on these month
  reads: see [HISTORICAL_RIVER_EVENTS.md](HISTORICAL_RIVER_EVENTS.md). Since #105 the month digests also carry a
  threshold-state timeline and the month caches are keyed `-v2`.
