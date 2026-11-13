# HPP status service (#89), shadow mode

The HPP status service turns verified RDP Colwick observations into HPP
open/closed state and transitions. It runs **inside the isHPPOpen Vercel app**,
so isHPPOpen remains the single "app": rules, state, history, public status
and alerts are all in one place. RDP stays the canonical observation source
and holds no HPP logic.

**Status:** shadow scheduling is implemented. The cron
`/api/internal/hpp/run` (at 7, 22, 37 and 52 minutes past each hour,
`CRON_SECRET`) runs one evaluation when `HPP_STATUS_SOURCE=shadow` and
`VERCEL_ENV=production`. It is a no-op otherwise, and `legacy` is the default.
Evidence is at the authenticated `/api/admin/hpp-shadow`. The legacy scraper
is still the only `openIndicator` writer, and `/api/hppstatus` and HPP alerts
still read `openIndicator`. There is no authoritative mode.

## Production shadow evidence (reviewed 13 November 2026)

- `HPP_STATUS_SOURCE` is set for Vercel Production only. The cron ran 955 of
  ~956 expected 15-minute runs from 3 November 13:07Z to 13 November 11:52Z,
  with no lost lease races (`revision` = 2 × runs).
- **Every run held as `identity_mismatch`.** RDP `Observation` rows do not
  carry `measurementId` (it is page `meta`), but the rule required it on every
  row. No observation was ever evaluated: the state is still the legacy seed
  (`open`, basis 2026-03-15T19:52:22Z), there are no shadow transitions, and
  `firstEligibleAt` is unset. The 14-day window has **not started**. The fix
  (rows inherit the page's `measurementId`; a mismatch on either still holds)
  starts it at the first eligible run after deployment.
- No Colwick crossing of 2.2 m has happened since the legacy record of
  15 March (the last ≥2.2 m event ended 19:30Z that day). The legacy writer's
  silence since then is correct, not a fault.
- Historical legacy timestamps trail the RDP observation edge by 22–82 minutes
  (EA publication plus scraper poll lag). Pairing therefore accepts a pair
  when either the shadow's observation time or its evaluation time is within
  30 minutes of the legacy timestamp, and reports both deltas.
- `openIndicator` has 126 records and is unchanged; nothing in shadow wrote it.

## Reading and exporting the evidence

- `GET /api/admin/hpp-shadow` (signed in): the full report. Its
  `acceptance` section evaluates every shadow criterion below as `pass`,
  `fail`, `pending` (more time or a real crossing needed), `review` (a human
  must explain it) or `info`, with `ready` and `blocking`. Missing crossings
  are `pending`, never `fail`.
- `GET /api/admin/hpp-shadow?format=csv`: the acceptance timeline (checks,
  transition pairs, legacy-only and shadow-only transitions, holds, closure
  day differences) as a CSV download for #89.
- `npm run hpp:shadow-report [-- --summary | --csv]`: the same report built
  directly from Mongo with read-only queries, for terminals and agents.

| Check | Meaning |
| --- | --- |
| `evidence_window` | Days since `firstEligibleAt`; passes at 14. |
| `crossings_both_directions` | At least one closing and one opening shadow transition; otherwise record a waiver on #89. |
| `contiguous_sequence` | Transitions are 1..n and the state has adopted n. |
| `gaps_explained` | No hold longer than 2 hours, or with a review-class reason (`identity_mismatch`, `conflict`, `rule_mismatch`, `orphaned_transition`, `sequence_conflict`), inside the window. Holds that ended before the window are `preEvidence`. |
| `no_unresolved_review_holds` | Not currently holding on `orphaned_transition` or `sequence_conflict`. |
| `current_status_agrees` | Shadow and legacy `currentStatus` agree (pending within 30 minutes of a crossing). |
| `transitions_paired` | Every legacy change since the window start pairs with one shadow transition of the same direction. |
| `closure_days_within_1` | 7/28/182/365-day counts differ by at most one day. |
| `run_cadence` | Runs are at least 95% of the 15-minute schedule since the first run. |
| `source_age` | Last and maximum observation age, distribution (≤15 min, ≤30 min) and stale-hold count. |
| `no_shadow_side_effects` | `openIndicator` count and latest record, to compare with scraper logs. |

## Pieces (`libs/hpp/`)

| Module | Role |
| --- | --- |
| `hppDecision.js` | Pure rule: open below 2.2 m on `ea-colwick-level` (mASD/ASD); identity, integrity, 30-minute freshness and conflict checks (#96). |
| `hppWindows.js` | Pure 7/28/182/365-day calculation with carry-in (#63), shared with `/api/hppstatus`. |
| `hppHistory.js` | Transition identity, legacy seed, history projection, legacy comparison, shadow report. |
| `hppShadowRun.js` | One evaluation: lease, roll-forward, decide, record, commit. |
| `hppEvidence.js` | Bounded 2-hour Colwick read through the web's RDP client (`createRdpClient`), with a 10-second deadline. |
| `hppShadowStore.js` | Reads `openIndicator`; writes only `hppShadowState` and `hppShadowTransitions`. |
| `hppShadowService.js` | `createHppShadowService({ db })` → `runOnce()`, `report()`. |
| `hppAcceptance.js` | Pure acceptance checks, transition pairing, gap classification and CSV export. |

## Behaviour

- **Evidence.** Only a verified RDP page for the exact measurement ID (page
  `meta`, or the row when a row carries one), whose rows carry the exact unit,
  datum, provider measure and source, is eligible. The newest
  observation must be no more than 30 minutes old and no more than 5 minutes in
  the future. The web RDP client rejects unverified or mismatched pages itself,
  so those cases surface as `source_unavailable` with
  `lastSourceError: RESPONSE_CONTRACT_ERROR`. Any hold keeps the last-known
  state, records nothing, and is tracked (`holdSince`, `consecutiveHolds`).
- **Seed.** The first run takes its state from the latest valid
  `{timestamp, value}` record in `openIndicator`. That timestamp is a scraper
  poll time. It is kept verbatim as the basis and in `seed`, and is never
  reinterpreted as an observation time. Older-shape rows are ignored.
- **Transitions.** A crossing is recorded as `${ruleId}#${sequence}` with
  observation time, evaluation time, level, rule and previous state, marked
  `authoritative: false`. No crossings are synthesised across a gap.
- **Single writer.** Vercel cron delivery can overlap or repeat, so each run
  claims a lease (`LEASE_MS`, 5 minutes) by compare-and-set on `revision`. An
  overlapping run exits as `skipped`. The route's `maxDuration` must stay below
  the lease (60 seconds or less).
- **Retry safety.** Before deciding, a run adopts any transition already
  recorded at `sequence + 1` by an interrupted run. A duplicate insert at the
  same id counts as already recorded. If a pending transition sits behind the
  basis, or a duplicate disagrees, the run holds for review
  (`orphaned_transition`, `sequence_conflict`) and rewrites nothing.
- **Continuity.** When eligible evidence resumes, the hold streak is stored as
  a gap `{from, to, reason, runs}` (the last 50 are kept). `report()` returns
  `status` (`unseeded`, `ok`, `holding` or `run_overdue` after 45 minutes),
  last-known state, evidence age, gaps, whether the sequence is contiguous,
  and a field-by-field comparison with the legacy projection using the public
  calculation (`lastChangedAt` within 30 minutes).

## Hosting and access (decided 3 November 2026: in the Vercel app)

- **RDP:** reuses the web's existing server-side client and per-environment
  caller. Production uses `river-data-platform-production-vercel-production`;
  Preview uses the staging caller. That role can already invoke
  `/v1/measurements/*/observations`, so no RDP or IAM change is needed. One
  bounded read per run is about 96 requests a day, against a 5 rps throttle.
- **Mongo:** the app's existing `connectToDatabase()` connection. No new
  storage. The two shadow collections need only the default `_id` index.
- **No new AWS resources.**

How the scheduling slice handles these constraints:

1. **The no-write guarantee is enforced by code, not by credential.** The
   app's Mongo user can write `openIndicator` (it currently has
   `readWriteAnyDatabase`). Shadow evidence that nothing was written therefore
   comes from the code path (the store has no `openIndicator` write) and from
   `openIndicator` count and audit checks, not from Atlas permissions.
2. **Merging is not activation.** `HPP_STATUS_SOURCE` defaults to `legacy`
   (a no-op) and accepts only `legacy` or `shadow`; any other value fails the
   run with a 500 and writes nothing.
3. **Preview shares the production database.** Shadow runs write only when
   `VERCEL_ENV=production`, until Preview data is isolated.
4. **It has its own cron route.** `/api/internal/hpp/run` keeps HPP failures
   and its kill switch separate from alert evaluation. Its `maxDuration` of
   60 seconds stays below the 5-minute lease. The report has its own admin
   route, so the operational-health contract is unchanged.

## Proposed single-writer cutover acceptance criteria

All of these must hold before an authoritative writer is enabled:

1. **Shadow evidence.** At least 14 consecutive days of production shadow runs,
   including at least one real crossing in each direction or an explicitly
   recorded waiver. Over that period:
   - `continuity.contiguous` is true
   - every gap is explained
   - no `orphaned_transition` or `sequence_conflict` hold is unresolved
   - `comparison.currentStatus` agrees except within 30 minutes of a crossing
   - every legacy transition pairs with one shadow transition within 30 minutes,
     with no unpaired transitions on either side
   - closure-day counts are within ±1 day, or each difference is explained
2. **Zero authoritative side effects in shadow.** The `openIndicator` document
   count and latest record change only with legacy scraper writes. There are
   no service-originated changes to alert subscription, progress or delivery
   records, and no emails.
3. **Source.** The `lastObservationAgeMs` distribution is reviewed against the
   30-minute policy.
4. **Writer change reviewed.** A separate PR adds an authoritative mode. It
   writes `toOpenIndicatorRecord()` with `_id = transitionId`, so a retried
   insert collides, keeps `{timestamp, value}` and adds only provenance fields.
   It is selectable only by explicit environment configuration. The shadow
   collections stay as an audit trail.
5. **Ordered switch, one writer at every step:**
   1. Disable the scraper's `updateOpenIndicator` call through the scraper's
      release workflow. Confirm one scheduled run logs no `openIndicator`
      insert.
   2. Reconcile. The latest `openIndicator` record L must equal the service's
      state. If not, stop. Seed authoritative state from L, keeping L's
      timestamp.
   3. Set the authoritative mode in Production and redeploy. Record the
      deployment id and the previous deployment for rollback.
   4. On the first runs, no record unless there is a real crossing.
      `/api/hppstatus` keeps its shape and values. HPP alerts fire only on real
      crossings; a few duplicate emails at the switch are an accepted risk.
6. **Exactly one writer afterwards.** Scraper logs show no `openIndicator`
   writes, and only the app's authoritative mode writes it.

## Proposed rollback acceptance criteria

Triggers include any of:

- `run_overdue` for more than 1 hour
- an unresolved hold for more than 2 hours while RDP has fresh data
- a `currentStatus` disagreement that crossing timing does not explain
- any write outside `openIndicator` and the shadow collections

Ordered rollback, never two writers:

1. Stop the app writer. Either set the mode back to `shadow` or `legacy` and
   redeploy, or instantly roll back to the recorded previous deployment.
   Confirm a scheduled run makes no `openIndicator` insert.
2. Re-enable the scraper writer through its release workflow. It reads the
   latest `openIndicator` record's `value`, so app-written records with
   additive fields are compatible.
3. Records the app wrote stay as historical facts with their provenance. They
   are never deleted, re-timed or rewritten.

Acceptance for the rollback:

- At most one scheduled interval has no writer; status holds last-known
  meanwhile.
- No duplicate record for any crossing.
- `/api/hppstatus` is unchanged in shape.
- Alert delivery state changes only for real crossings.
- The rollback, and any accepted duplicate emails, are recorded on #89.
