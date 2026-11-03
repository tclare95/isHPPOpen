# HPP status service (#89), shadow mode

An independently operated service that turns verified RDP Colwick
observations into HPP open/closed state and transitions. It sits outside RDP
and outside the Next.js app: nothing in `app/` imports this directory.

**Status:** code only. There is no runtime entry point, schedule, credential or
infrastructure here. The legacy scraper is still the only `openIndicator`
writer, and `/api/hppstatus` and HPP alerts still read `openIndicator`.

## Pieces

| Module | Role |
| --- | --- |
| `libs/hpp/hppDecision.js` | Pure rule: open below 2.2 m on `ea-colwick-level` (mASD/ASD); identity, integrity, 30-minute freshness and conflict checks (#96). |
| `libs/hpp/hppWindows.js` | Pure 7/28/182/365-day calculation with carry-in (#63), shared with the web reader. |
| `libs/hpp/hppHistory.js` | Transition identity, legacy seed, history projection, legacy comparison, shadow report. |
| `libs/hpp/hppShadowRun.js` | One evaluation: lease, roll-forward, decide, record, commit. |
| `services/hpp-status/rdpColwickReader.js` | Bounded 2-hour RDP observations read through an injected SigV4 `signedGet`. |
| `services/hpp-status/mongoShadowStore.js` | Reads `openIndicator`; writes only `hppShadowState` and `hppShadowTransitions`. |
| `services/hpp-status/index.js` | `createHppShadowService({ db, apiUrl, signedGet })` → `runOnce()`, `report()`. |

## Behaviour

- **Evidence.** Only an RDP page with `pageIntegrity: "verified"` whose rows all
  carry the exact measurement ID, unit, datum, provider measure and source is
  eligible. The newest observation must be no more than 30 minutes old and no
  more than 5 minutes in the future. Anything else, including an RDP failure,
  is a **hold**: last-known state stays the same, nothing is recorded, and the
  hold is tracked (`holdSince`, `consecutiveHolds`, `lastSourceError`).
- **Seed.** The first run takes its state from the latest valid
  `{timestamp, value}` record in `openIndicator`. That timestamp is a scraper
  poll time. It is kept verbatim as the basis and in `seed`, and is never
  reinterpreted as an observation time. Older-shape rows are ignored.
- **Transitions.** A crossing is recorded as `${ruleId}#${sequence}` with
  observation time, evaluation time, level, rule and previous state, marked
  `authoritative: false`. No crossings are synthesised across a gap.
- **Single writer.** Each run claims a lease (`LEASE_MS`, 5 minutes) by
  compare-and-set on `revision`. An overlapping run exits as `skipped`. The
  runtime's hard timeout must stay below the lease.
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

## Hosting recommendation (needs approval)

**Recommended:** a dedicated Node.js 22 Lambda in its own AWS SAM stack
(`hpp-status-service-production`, eu-west-1, account 080812383734). It would
run on EventBridge Scheduler `rate(15 minutes)` with reserved concurrency 1,
a 60-second timeout and its own execution role. Releases would use the suite's
existing manual prepare/apply workflow pattern.

Why:

- The RDP read API is AWS_IAM in eu-west-1. An IAM principal in the same
  account signs natively, with no OIDC federation to reuse or widen.
- The suite already runs scheduled Node Lambdas in eu-west-1 with scoped
  service roles and manual release gates, so no new operating model is needed.
- It keeps HPP separate from all three things it must not be tied to. Vercel
  would mean reusing the web's caller role, which is excluded, and coupling to
  web deploys. The scraper is the legacy writer being retired, and sharing its
  stack would blur the single-writer handoff and rollback. RDP is a product
  boundary.
- Storage is unchanged: the existing Mongo app database. The function, schedule
  and roles would be the only new AWS resources. This revisits the 1 November
  "no new AWS resources" note, so it needs explicit approval.

The code can stay in this repository until hosting is approved. Merging to
`main` deploys Vercel, but this directory is not imported, so the web's
behaviour does not change. If the service's release lifecycle diverges, move
`libs/hpp/` and this directory into their own repository. They have no Next.js
imports.

## Access boundary (separately approved, not created)

**RDP read (new caller).** RDP currently accepts exactly one caller role per
stage. `RiverDataPlatform.ReadApi/Function.cs` builds
`…-<stage>-vercel-<env>` and rejects any other assumed role. So the HPP service
needs a reviewed RDP change, plus a caller stack:

- An exact second production caller, for example
  `river-data-platform-production-hpp-status`, used as the Lambda execution
  role. The trust policy allows `lambda.amazonaws.com` with `aws:SourceArn`
  pinned to the HPP function.
- An invoke policy that allows only
  `GET /v1/measurements/ea-colwick-level/observations` and `/health` on the
  production API, with an explicit `NotResource` deny (the same pattern as
  `deploy/read_api_iam.py`).
- The RDP handler allowlist extended to that exact role and nothing broader.
  Gateway 4xx alarms need to account for a second caller. Load is about 96
  requests a day, against a 5 rps throttle.
- The Vercel `river-data-platform-production-vercel-production` role and its
  trust stay unchanged.

**Mongo.** A dedicated Atlas user with a custom role on `ishppopen`:

- `find` on `openIndicator`
- `find`, `insert` and `update` on `hppShadowState` and `hppShadowTransitions`
- no `remove`, no other collections, no admin role

Its credential lives in its own Secrets Manager secret, readable only by the
HPP execution role. Do not reuse the web or scraper credential. Only the
default `_id` index is needed.

## Proposed single-writer cutover acceptance criteria

All of these must hold before an authoritative writer is enabled:

1. **Shadow evidence.** At least 14 consecutive days of shadow runs on
   production RDP, including at least one real crossing in each direction or an
   explicitly recorded waiver. Over that period:
   - `continuity.contiguous` is true
   - every gap is explained
   - no `orphaned_transition` or `sequence_conflict` hold is unresolved
   - `comparison.currentStatus` agrees except within 30 minutes of a crossing
   - every legacy transition pairs with one shadow transition within 30 minutes,
     with no unpaired transitions on either side
   - closure-day counts are within ±1 day, or each difference is explained
2. **Zero authoritative side effects in shadow.** Atlas role and audit evidence
   show no writes to `openIndicator`, alert subscription, progress or delivery
   collections, and no emails from the service.
3. **Source.** Production `ea-colwick-level` access has been verified through
   the HPP caller role. The `lastObservationAgeMs` distribution is reviewed
   against the 30-minute policy.
4. **Writer change reviewed.** A separate PR adds authoritative mode. It writes
   `toOpenIndicatorRecord()` with `_id = transitionId`, so a retried insert
   collides, keeps `{timestamp, value}` and adds only provenance fields. The
   shadow collections stay as an audit trail.
5. **Ordered switch, one writer at every step:**
   1. Disable the scraper's `updateOpenIndicator` call through the scraper's
      release workflow. Confirm one scheduled run logs no `openIndicator`
      insert.
   2. Reconcile. The latest `openIndicator` record L must equal the service's
      state. If not, stop. Seed authoritative state from L, keeping L's
      timestamp.
   3. Grant `insert` on `openIndicator` to the HPP Mongo user and enable
      authoritative mode.
   4. On the first runs, no record unless there is a real crossing.
      `/api/hppstatus` keeps its shape and values. HPP alerts fire only on real
      crossings; a few duplicate emails at the switch are an accepted risk.
6. **Exactly one writer afterwards.** The HPP role is the only principal with
   `insert` on `openIndicator`, and scraper logs show no `openIndicator` writes.

## Proposed rollback acceptance criteria

Triggers include any of:

- `run_overdue` for more than 1 hour
- an unresolved hold for more than 2 hours while RDP has fresh data
- a `currentStatus` disagreement that crossing timing does not explain
- any write outside `openIndicator` and the shadow collections

Ordered rollback, never two writers:

1. Disable the HPP schedule, then revoke its `openIndicator` insert.
2. Re-enable the scraper writer through its release workflow. It reads the
   latest `openIndicator` record's `value`, so service-written records with
   additive fields are compatible.
3. Records the service wrote stay as historical facts with their provenance.
   They are never deleted, re-timed or rewritten.

Acceptance for the rollback:

- At most one scheduled interval has no writer; status holds last-known
  meanwhile.
- No duplicate record for any crossing.
- `/api/hppstatus` is unchanged in shape.
- Alert delivery state changes only for real crossings.
- The rollback, and any accepted duplicate emails, are recorded on #89.
