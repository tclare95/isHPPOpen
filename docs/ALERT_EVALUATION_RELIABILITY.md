# Alert evaluation reliability (#47, reliability-only)

Scope: make the existing Vercel alert evaluator (`/api/internal/alerts/run`,
`libs/services/colwickAlertsService.js`) safe under overlapping invocations, retries,
partial MongoDB failures and uncertain email delivery. **Unchanged:** the
`*/15 * * * *` cron in `vercel.json`, every alert source (legacy Trent snapshot,
predictor forecast, HPP status, water quality/CSO), thresholds, hysteresis and
freshness rules, the transition identity and Resend idempotency-key formula, and
the subscription/confirmation/unsubscribe flows. No RDP alert source, no cadence
trial, no subscription reset.

## Problems found in the previous implementation

| # | Gap | Effect |
| --- | --- | --- |
| 1 | Subscription `armed`/`triggered` writes were unconditional. | A slow or overlapping run with an older snapshot could overwrite a newer transition (e.g. re-arm after another run had re-triggered), producing a second email for one breach. |
| 2 | Delivery identity is `alertKey:observedAt:value`. A send that failed, timed out or crashed before the state write left the rule `armed`. | The next reading created a *new* delivery with a *new* idempotency key, so Resend could not de-duplicate it: a duplicate email after timeouts or a lost state write. |
| 3 | A losing overlapping run was counted as "suppressed" and marked the rule `triggered`, while the winning run's send failed. | The failed delivery was never retried and the rule stayed triggered: a lost notification. |
| 4 | `failed` → `claimed` re-claim was an unconditional write. | Two runs could both re-send. |
| 5 | Any MongoDB error in the rule loop aborted the run, and the run record was only written at the end. | A crashed or partially failed run left no record. |
| 6 | `createIndex` ran on every invocation; no provider timeout; all send errors treated alike. | Schema writes from the hot path, a hung provider could consume the whole function, uncertain and definite failures indistinguishable. |

A behaviour probe against the previous code confirmed 1–3: "timeout then a
new reading" sent 2 emails with 2 distinct keys; "sent but state write lost"
sent 2 emails with 2 keys; "rejected send overlapping a suppressed run" left
the rule `triggered` with only a `failed` delivery.

## Mechanism (existing collections, additive fields)

1. **Compare-and-set on the subscription.** Every armed/triggered change
   matches the `stateRevision` (and `lastConditionState`) the run read and
   increments it. Legacy documents without the field match it as missing.
   A stale or overlapping run's write matches nothing and is counted as
   `suppressed`. Unsubscribed/pending rules never match (`status: "active"`).
2. **Gate, then intent, then send.** A newly met condition first sets the
   subscription to `triggered` with `pendingTransitionId`, `lastTransitionId`
   and `pendingSince` (one winner). Only then is the `alertDeliveries` record
   inserted (`state: "claimed"`, `attempts`, `firstAttemptAt`,
   `attemptStartedAt`, the immutable email `payload` and the unchanged
   `idempotencyKey`). Only then is the email sent.
3. **Pending rules are resumed, not re-evaluated.** While
   `pendingTransitionId` is set, later runs only drive that delivery to a
   terminal state. A newer reading can therefore never mint a second,
   uncorrelated delivery.
4. **Provider outcomes** (`AlertEmailError.deliveryOutcome` in
   `alertMailerService.js`, 10 s fetch timeout):
   - `rejected` (configuration error, HTTP 4xx except 409): definitely not
     sent. The delivery becomes `failed` and the rule is re-armed, as before.
   - `uncertain` (timeout, network error, HTTP 409/5xx, anything unknown): the
     delivery becomes `uncertain`; the rule stays triggered/pending.
5. **Recovery.** A later run re-claims an `uncertain` delivery (or a `claimed`
   one older than 10 minutes, i.e. an invocation that died mid-send)
   with a conditional write and re-sends **the same payload with the same
   idempotency key**, so Resend returns the original result if the first
   attempt was accepted. Automatic retries stop and the delivery becomes
   `held_for_review` when either:
   - 23 hours have passed since `firstAttemptAt` (Resend keeps keys for
     24 hours; one-hour margin), or
   - 5 attempts have been made, or
   - a definite rejection follows an earlier uncertain attempt.
6. **Partial commits.** If the gate committed but the intent did not, nothing
   can have been sent; after 10 minutes the rule is released to `armed`. If the
   send succeeded but recording it failed, the stale claim is retried under the
   same key. If the delivery is `sent` but the subscription was not completed,
   the next run completes it without sending.
7. **Per-rule isolation.** A database error on one rule is counted
   (`errors`, `errorCategories`) and the run continues with the others; durable
   state lets a later run resume.

### Delivery states

| State | Meaning | Next run |
| --- | --- | --- |
| `claimed` | Attempt in progress (or the invocation died). | Leave if < 10 min old; otherwise treat as uncertain. |
| `sent` | Provider accepted it. | Complete the subscription if still pending. |
| `failed` | Definitely rejected; nothing sent. | Rule already re-armed. A same-transition record is retried. |
| `uncertain` | Provider may have accepted it. | Retry with the same key/payload inside the window. |
| `held_for_review` | Automatic retry is no longer safe. | Nothing; rule stays triggered. Operator reconciles. |
| `abandoned` | Operator confirmed it was not sent. | Release the rule to `armed`; normal evaluation follows on the next run. |

Delivery records now hold the email payload (gauge name, values, rule text and
the subscription's existing unsubscribe token) but **not** the email address,
which is still read from the subscription.

## Run records (`alertRuns`)

- A run first marks any `running` record older than 30 minutes as
  `incomplete` (`reconciledByRunId`), then inserts its own
  `{ runId, status: "running", startedAt }` **before** any subscription work.
  If that insert fails, nothing is evaluated or sent.
- On completion it records `success` or `degraded` and the counters:
  `scanned, sent, rearmed, skipped, suppressed, failed, uncertain, heldForReview, inFlight, released, errors`.
  It also records `errorCategories`, `sourceFailures`, `deliveryIndex`
  (`present|missing|unverified`), `outstandingDeliveries`
  (`staleClaims, uncertain, heldForReview`, collection-wide), `needsReview`,
  `incompleteRunsReconciled` and `durationMs`.
- An exception that stops the run records `failed` with a sanitized
  `errorCategory`. No subscriber email addresses are written to run records.
- `degraded` = any source failure, rule error, definite send failure,
  uncertain send, new hold, or a missing unique delivery index.
- `skipped` still includes send failures and rule errors, as it did before.

Operator queries (read-only):

```js
db.alertRuns.find().sort({ startedAt: -1 }).limit(5)          // latest runs; a gap > 15 min = missing run
db.alertRuns.find({ status: { $in: ["failed", "incomplete", "running"] } }).sort({ startedAt: -1 })
db.alertDeliveries.find({ state: { $in: ["uncertain", "held_for_review"] } })
db.alertDeliveries.find({ state: "claimed", updatedAt: { $lt: <ISO 10 min ago> } })  // stale claims (incl. pre-#47 records)
```

## Operator reconciliation of a held delivery

1. Look up the provider log using the delivery's `idempotencyKey` and time.
2. If it was delivered, set `state: "sent"` (plus `reviewedAt` and `reviewedBy`).
   The next run completes the transition without sending.
3. If it was not delivered, set `state: "abandoned"`. The next run re-arms
   the rule; if the condition still holds, the following run sends a *new*
   transition with a new key.
4. Pre-#47 stale `claimed` records are not attached to any pending rule and are
   only reported. Mark them `sent` or `abandoned` once reviewed.

Do not edit `stateRevision` or `pendingTransitionId` by hand. These are
production writes and need the usual explicit approval.

## Index provisioning

The evaluator no longer calls `createIndex`. It checks (read-only, once per
process) for the unique `{ alertKey: 1, transitionId: 1 }` index it previously
created on every run, so existing deployments should already report
`present`. `npm run db:indexes:alerts` checks it (dry run); `--apply`
creates it only after approval. The subscription gate already prevents
duplicate intents, so the index is defence in depth. A missing index makes
runs `degraded`, not blocked.

## Compatibility and rollback

- Additive fields only: `stateRevision`, `pendingTransitionId`, `pendingSince`,
  `lastTransitionId` on subscriptions; `attempts`, `firstAttemptAt`,
  `attemptStartedAt`, `payload`, `lastError`, `heldAt` and `heldReason` on
  deliveries. Plus the new delivery states and run statuses above.
- Existing status, thresholds, `lastConditionState`, `lastTriggeredAt`,
  delivery history and idempotency keys are preserved and not rewritten.
- Rolling back to the previous code is safe: it ignores the new fields.
  However, it would evaluate a rule left pending/triggered as plain
  `triggered`, and would not resume uncertain deliveries. Before rolling back,
  check that there are no `uncertain`, `held_for_review` or stale `claimed`
  deliveries.

## Handoff to #51 Slice D

Slice D (alert-safe RDP reads, observed-time progress, catch-up and source
continuity) should **reuse** this mechanism rather than add another:

- **State changes:** use the same `stateRevision` compare-and-set for any new
  progress marker or source-continuity hold. Add fields such as
  `lastObservedAt` and the `alertSource` the rule was evaluated against to the
  same conditional update, so overlapping old/new deployments cannot write
  conflicting transitions.
- **Notifications:** go through `trigger()`, i.e. gate, intent, then send. The
  delivery identity is still `alertKey:observedAt:value`. If EA and RDP
  timestamps or values for the same logical crossing can differ, Slice D must
  define the cross-source identity before activation. The pending-transition
  gate already stops a second delivery while one is outstanding.
- **Holds:** "hold the rule" can reuse the same pattern: a rule with a
  pending/held marker is resumed, not re-evaluated.
- **Shadow mode:** must not call `createEvaluation` writers or the mailer. Run
  the pure `condition()` path only.
- **Not done here (by design):** observed-time freshness or progress per
  gauge, stale-source ordering between overlapping runs (`lastEvaluatedAt` is
  still evaluator time), and a "latest still meets" check before retrying an
  uncertain delivery. Within the 23-hour window, a retry may arrive after the
  crossing has cleared if the first attempt was really lost. Slice D's
  latest-eligible-observation rule should gate gauge retries.
- **Before live Slice D:** confirm the production index reports `present`,
  that there are no `held_for_review` or stale `claimed` deliveries (or that
  they are reconciled), and review a few days of `alertRuns` from this
  release.
