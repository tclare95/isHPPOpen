# HPP status service (#89): shadow and gated authoritative writer

The HPP status service turns verified RDP Colwick observations into HPP
open/closed state and transitions. It runs **inside the isHPPOpen Vercel app**,
so isHPPOpen remains the single "app": rules, state, history, public status
and alerts are all in one place. RDP stays the canonical observation source
and holds no HPP logic.

**Status:** shadow runs in Production. The cron `/api/internal/hpp/run`
(at 7, 22, 37 and 52 minutes past each hour, `CRON_SECRET`) evaluates once
when `HPP_STATUS_SOURCE` is `shadow` or `authoritative` and
`VERCEL_ENV=production`. It does nothing otherwise, and `legacy` is the
default. An authoritative writer is implemented but **inactive**. It writes
`openIndicator` only when **both** of these hold:

- `HPP_STATUS_SOURCE=authoritative`
- the writer control document names the app, after an operator handover

Today there is no control document, so the legacy scraper is the only
`openIndicator` writer. `/api/hppstatus` and HPP alerts read `openIndicator`
in every mode. Evidence is at the authenticated `/api/admin/hpp-shadow`.

## Production shadow evidence (reviewed 13 November 2026)

- `HPP_STATUS_SOURCE` is set for Vercel Production only. The cron ran 955 of
  ~956 expected 15-minute runs from 3 November 13:07Z to 13 November 11:52Z,
  with no lost lease races (`revision` = 2 × runs).
- **Every run held as `identity_mismatch`.** RDP `Observation` rows do not
  carry `measurementId` (it is page `meta`), but the rule required it on every
  row. No observation was ever evaluated: the state is still the legacy seed
  (`open`, basis 2026-03-15T19:52:22Z), there are no shadow transitions, and
  `firstEligibleAt` is unset. The evidence window has **not started**. The fix
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
| `evidence_window` | Hours since `firstEligibleAt`; passes at 48 (owner decision, 13 November 2026, replacing 14 days). |
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

## Single-writer control (implemented, inactive)

| Piece | Role |
| --- | --- |
| `hppWriterControl.js` | Pure ownership rules: `appWriterStatus`, `legacyMayWrite`, fences. |
| `hppHandover.js` | Pure handover plans: reconcile and reseed for `to-app`, and the reverse `to-legacy`. |
| `hppAuthoritativeStore.js` | State in `hppStatusState`; transitions as `openIndicator` records; CAS `applyHandover`. |
| `hppAuthoritativeService.js` | The shadow run, unchanged, plus a writer guard. |
| `scripts/hpp-writer.mjs` | `npm run hpp:writer -- status`, `to-app --expect-latest <id> [--apply]`, `to-legacy [--apply]`. |

- **One owner.** `hppWriterControl/openIndicator` holds `{ owner, epoch,
  switchedAt, previousOwner, reconciled, legacyAck, history }`. If the
  document is absent, legacy owns `openIndicator`, as before #89. The
  scraper writes only while `legacyMayWrite` is true. The app writes only
  while `appWriterStatus` allows it. Moving ownership needs `--apply` on the
  CLI; deploys and environment variables never move it.
- **Proof the old writer stopped.** Every scraper run acknowledges the
  current epoch: `legacyAck { epoch, observedOwner, runStartedAt, wrote }`.
  The app writes only once all of these are true:
  - a scraper run that **started after** the switch saw `owner: app`
  - that run wrote nothing
  - `LEGACY_FENCE_MS` (5 minutes, longer than the scraper's 120-second
    Lambda timeout) has passed

  Until then the run holds as `writer_awaiting_legacy_stop`,
  `writer_legacy_still_writing` or `writer_fence`.
- **Reverse fence.** After `to-legacy`, the scraper resumes only
  `APP_FENCE_MS` (5 minutes) after the switch. That is longer than the app
  route's 60-second `maxDuration`. The app's guard also checks ownership
  again immediately before inserting, so a run that loses ownership while it
  reads RDP writes nothing.
- **Second-writer detection.** Before deciding and before inserting, the
  newest valid `openIndicator` record must be one the app expects: its seed,
  its last transition, or a pending `sequence + 1`. Any other record means
  another writer, and the run holds as `writer_foreign_write`. It also holds
  as `writer_epoch_mismatch` when the state was seeded for another epoch.
- **Records.** Each transition becomes `openIndicator`
  `{ _id: "<ruleId>#<sequence>", timestamp: <observedAt Date>, value,
  observedAt, evaluatedAt, level, ruleId, source, sequence, provenance:
  "hpp-status-service" }`. A retried, overlapping or repeated insert collides
  on the default `_id` index. An interrupted run's record is adopted on
  retry. A lost acknowledgement counts as recorded. Readers use only
  `timestamp`/`value`. The scraper reads the newest record's `value`, so it
  stays compatible after a rollback.
- **Reconciled seed.** `to-app` refuses (exit 2), and writes nothing, unless
  all of these hold:
  - the newest valid record is the `--expect-latest` id the operator read
    from `status`
  - shadow is not holding
  - shadow evaluated within the last 45 minutes
  - shadow agrees with that record's `value`

  It then seeds `hppStatusState` from that record, keeping its timestamp as
  the basis. It continues the sequence from any earlier activation, so ids
  never repeat.
- **Stale or missing evidence** holds the last-known status, exactly as in
  shadow. No crossing is synthesised across a gap.
- **`/api/hppstatus`, closure windows and alerts are unchanged.** They read
  `openIndicator` through `getHppStatusSnapshot()`. The HPP alert evaluator
  fires on `currentStatus` changes in that snapshot. The service sends no
  email itself.
- **Mode fallback.** With `authoritative` set but legacy still the owner,
  the cron runs the shadow evaluation (`writer: legacy`). If the control
  names the app but the mode is not `authoritative`, nobody writes. The
  run summary then carries
  `warning: control_names_app_but_mode_is_not_authoritative`. Always roll
  back with `to-legacy`, never by changing the mode alone.

## Cutover acceptance criteria

All of these must hold before `to-app --apply`:

1. **Shadow evidence.** `acceptance.ready` is true, or every blocking check
   is explained on #89:
   - at least 48 hours since `firstEligibleAt` (owner decision, 13 November
     2026; previously 14 days)
   - at least one real crossing in each direction, or a waiver recorded on
     #89
   - contiguous transitions
   - every gap explained
   - no unresolved `orphaned_transition` or `sequence_conflict`
   - `currentStatus` agrees
   - every legacy change paired
   - closure days within ±1
   - cadence at least 95%
   - source age reviewed
2. **Zero authoritative side effects in shadow.** The `openIndicator`
   count and latest record change only with legacy scraper writes. There are
   no service-originated alert or email changes.
3. **Scraper control-aware.** The scraper release that reads
   `hppWriterControl` and writes `legacyAck` is deployed and verified. With
   no control document present, it behaves exactly as before.
4. **Cutover decision recorded on #89**, naming the operator and the
   accepted duplicate-email risk.

## Cutover procedure (one writer at every step)

1. Set `HPP_STATUS_SOURCE=authoritative` for Production and redeploy.
   Record the deployment id and the previous one. Nothing changes:
   ownership is still legacy, so the cron keeps running shadow
   (`writer: legacy`).
2. `npm run hpp:writer -- status`. Note `latestOpenIndicator.id`, and check
   that `shadow` is fresh, not holding and agrees.
3. `npm run hpp:writer -- to-app --expect-latest <id>`. This is a dry run:
   review the plan. Then run it again with `--apply`. From this point nobody
   writes until the scraper acknowledges, which takes at most one scraper
   interval.
4. Confirm the next scraper run logs that it skipped the write. `status`
   then shows `legacyAck.epoch` equal to `control.epoch` with
   `wrote: false`. After the 5-minute fence, `appWriter.allowed` is true.
5. On the next app runs, the summary shows `authoritative: true` and
   `action: none` unless there is a real crossing. `/api/hppstatus` keeps
   its shape and values.
6. Afterwards, exactly one writer: scraper logs show no `openIndicator`
   inserts, and new records carry `provenance: hpp-status-service`.

## Rollback

Triggers include any of:

- `run_overdue` for more than 1 hour
- a hold other than an expected writer or stale reason for more than 2 hours
  while RDP is fresh
- `writer_foreign_write`
- an unexplained `currentStatus` disagreement
- any write outside `openIndicator` and the HPP collections

Procedure:

1. `npm run hpp:writer -- to-legacy`, then the same with `--apply`. The
   app's next run holds as not-owner and falls back to shadow. The scraper
   resumes 5 minutes after the switch. It reads the newest record's `value`,
   so it writes only on a real change and does not duplicate the app's last
   record.
2. Optionally set `HPP_STATUS_SOURCE=shadow` and redeploy. A Vercel instant
   rollback to a deployment without this code is also safe **after** step 1.
   Never do either before step 1, because the scraper would stay stopped.
3. Records the app wrote stay as historical facts with their provenance.
   They are never deleted, re-timed or rewritten.
4. Re-activation is the cutover procedure again from step 2. Sequence ids
   continue, for example `#3` after `#2`.

Rollback acceptance:

- No more than one scheduled interval without a writer. Status holds
  last-known meanwhile.
- No duplicate record for any crossing.
- `/api/hppstatus` is unchanged in shape.
- Alert delivery state changes only for real crossings.
- The rollback, and any accepted duplicate emails, are recorded on #89.
