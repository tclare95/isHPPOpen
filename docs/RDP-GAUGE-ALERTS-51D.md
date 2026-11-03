# RDP-backed live gauge alerts (#51 Slice D)

Implements section D of [unify-gauge-consumers](../openspec/changes/unify-gauge-consumers/tasks.md)
on top of the [#47 reliability mechanism](ALERT_EVALUATION_RELIABILITY.md), the
[#51-A client](RDP-CLIENT-51A.md) and its canonical aliases. Only **live gauge rules**
(`alertType: "gauge"`, `source: "live"`) change. Forecast, HPP, water-quality/CSO rules, the
`*/15 * * * *` cron, subscription flows, delivery states and the idempotency-key formula are
unchanged. No new collection, queue, lease or event processor is added.

**This PR changes no Vercel setting, deploys nothing and switches no source.** Every target
stays `RDP_GAUGE_ALERTS_SOURCE` unset (legacy). Note that merging to `main` would still change
production *legacy-mode* gauge evaluation (see [Behaviour changes in legacy mode](#behaviour-changes-in-legacy-mode)).

## Files

| File | Role |
| --- | --- |
| `libs/alerts/gaugeAlertDecision.js` | Pure decisions: freshness, hysteresis, progress marker, continuity, catch-up, retry gate, mode parsing. No I/O. |
| `libs/alerts/gaugeObservations.js` | Server-only alert-safe reader for legacy EA and RDP. Loaded lazily by the evaluator. |
| `libs/alerts/gaugeAlertShadow.js` | Pure legacy-versus-RDP comparison. It has no database handle and no mailer. |
| `libs/services/colwickAlertsService.js` | Existing evaluator. Live gauge rules go through the decision module and the #47 writes. |

## Modes

`RDP_GAUGE_ALERTS_SOURCE` is read **once at the start of each run** and pinned for that run,
including the retries it performs. It is independent of `RDP_TRENT_SOURCE` and `RDP_LEVELS_SOURCE`.

| Mode | Authoritative live gauge source | RDP reads | Writes and emails |
| --- | --- | --- | --- |
| absent / `legacy` | EA, alert-safe reader | none (the RDP client is never constructed) | normal |
| `shadow` | EA, alert-safe reader, identical to `legacy` | one bounded read per gauge, concurrent | normal **legacy** writes only. The RDP comparison is logged. |
| `rdp` | RDP only. There is no automatic legacy fallback. | one bounded read per gauge | normal |
| anything else | none. Live gauge rules are skipped and `sourceFailures` includes `gauge-source-config`. | none | other alert types continue |

## Alert-safe reader

One uncached read per gauge that has at least one active live rule, per run, with a 10 s deadline.

- **Legacy:** `GET https://environment.data.gov.uk/flood-monitoring/id/measures/{providerMeasureId}/readings?_sorted&since={now-24h}&_limit=193`
  with `cache: "no-store"`. Every item's `measure` must be exactly that provider measure, or the
  whole series is rejected (`MEASUREMENT_CONTRACT_ERROR`). The display's station
  request, 900 s fetch cache and in-process last-successful snapshot are not used.
- **RDP:** `client.getObservations(measurementId, { from: now-24h, to: now, limit: 193 })`, called
  directly, so the 900 s `unstable_cache` display history is bypassed. The #51-A client already
  rejects any row whose unit, datum, provider measure, source or page integrity does not match.
- **Rows:** the value must be a finite number and the time a past instant. Quality must be
  absent/`null` (the representation of live EA readings, confirmed in RDP stage data) or
  `Good`/`Unchecked`. RDP returns the provider's raw JSON text (e.g. `"\"Good\""`), which is
  decoded first. Any other quality (`Suspect`, `Estimated`, `provisional`, …) makes the row
  ineligible. Equal duplicates collapse. **Different values at one instant are conflicts.**
- **Freshness:** the newest *eligible* observation must be no more than 30 minutes old
  by observed time. Otherwise the gauge is `stale` and its rules are skipped. Fetch time, cron
  time and the dashboard cache never count.
- Timestamps are normalized to the EA `dateTime` spelling (`2026-11-03T12:00:00Z`), so the
  same instant from EA or RDP (`+00:00`) produces the same transition and delivery identity.
  Production legacy transition IDs, which used EA's `dateTime` verbatim, are unchanged.

### Bounds and why

| Bound | Value | Basis |
| --- | --- | --- |
| Freshness | 30 min | Accepted decision. RDP stage evidence shows EA level/flow observations ingested about 19–35 minutes after observed time, so occasional skipped runs are expected and accepted. |
| Catch-up window | 24 h (96 readings at 15 min) | Covers a missed cron day or a provider outage before a *triggered* rule needs review. It is one EA/RDP page. |
| Row budget | 192 (2× expected) | More rows means an abnormal cadence. Affected rules hold (`catchup_budget_exceeded`) rather than reading part of the window. |
| Read deadline | 10 s per gauge | Same per-series budget as the #51-B display, well inside the function limit. |

Gaps inside the window are legitimate and need no continuous quarter-hour series.

## Observation progress (additive fields on `alertSubscriptions`)

`lastObservedAt`, `lastObservedValue`, `lastObservedSource` (`legacy|rdp`),
`lastObservedMeasurementId`, `lastObservedState`, `lastObservedTransitionId`, plus an optional
`gaugeHold: { reason, source, since }` label.

- The marker is written **inside the same `stateRevision` compare-and-set** as the trigger
  gate, the rearm, or a progress-only `advance` (which also increments `stateRevision`). An
  overlapping or stale run, including one from another deployment or source, matches nothing.
- The marker is **attached** only while `lastObservedState`/`lastObservedTransitionId` equal the
  subscription's `lastConditionState`/`lastTransitionId`. A writer that does not maintain markers
  detaches it, for example pre-Slice-D code after a code rollback or a manual edit. A detached
  marker is treated as no marker. `lastEvaluatedAt` stays evaluator time and is never used as progress.
- A re-subscription (`createColwickAlertSubscription`) clears the fields.

### Decision per live rule and run

| Situation | Outcome |
| --- | --- |
| Read failed, invalid, no eligible rows, or newest older than 30 min | **skip**: no trigger, rearm or progress |
| Rows over budget, or a conflict at/after the marker | **hold** |
| No attached marker, new rule (never evaluated) | evaluate the newest reading (as legacy did) and record progress |
| No attached marker, existing rule, source `legacy` | evaluate the newest reading exactly as the legacy evaluator did, and record progress |
| No attached marker, existing rule, source `rdp` | **enrol**: record progress with **no** crossing or rearm (state came from legacy) |
| Marker measurement differs from the read | hold `measurement_changed` |
| Marker instant present with a different value | hold `continuity_conflict` |
| Marker instant absent, source changed | hold `continuity_unproven`. A newer timestamp is never proof. |
| Marker instant absent, same source, inside window | hold `marker_missing` |
| No observation newer than the marker | unchanged (repeats/replays/older rows do nothing) |
| Newer observations | replay in time order with the existing hysteresis (0.03 m level, 1 m³/s flow) |
| Marker older than the window, rule **triggered**, no clear seen in the window | hold `catchup_window_exceeded` (a clear and re-cross may be hidden). An armed rule depends only on the newest reading. |
| Replay ends in a new crossing and the **newest fresh observation still meets** the rule | **trigger** with the newest observation, through the #47 gate → intent → send |
| Replay crossed but the newest observation no longer meets | no email. The rule stays/returns **armed** for the next real crossing (counted as a late-cleared crossing in shadow). |
| Triggered and the replay clears | rearm |

Holds are **not** a new state machine. They are re-decided on every run, so a
lagging source that later supplies the processed observation, or a corrected value, resumes the
rule automatically. `gaugeHold` is only a label for operators, written conditionally on
`stateRevision` and removed by the next progress write.

### Delivery retries

A live gauge rule with a `pendingTransitionId` is resumed exactly as in #47. In addition, an
uncertain, failed or stale-claimed delivery is **re-sent only while the newest eligible fresh
observation still meets the rule**. Otherwise the run counts it as `deferred` and sends nothing.
The 23-hour/5-attempt limits still apply first, so a delivery that cannot be retried safely
becomes `held_for_review` instead of being re-sent. Re-sends keep the original immutable
payload and idempotency key, even after a source switch.

## Shadow comparison

In `shadow`, live rules are copied before evaluation. After the authoritative legacy run has
recorded its `alertRuns` outcome, `compareGaugeAlertShadow` compares, per rule, the decision legacy
made with the one RDP would make from the same pre-run state. Because the markers are legacy-sourced,
the RDP decision rehearses the source-switch continuity checks. Per gauge it also reports matched
exact timestamps, value mismatches, legacy-only/RDP-only timestamps inside the overlap, newest-observation
lag, and each source's status, age and rejected rows.

- Output: one log line `RDP gauge alert shadow comparison {json}` (route `alerts/gauge-shadow`)
  and a small `shadow` summary in the cron response. **Nothing is written to `alertRuns`**,
  subscriptions or deliveries, and nothing is sent. The report contains gauge, direction, threshold
  and decisions only, never emails, alert keys or tokens.
- A failing or slow RDP read appears in the report. It cannot reject the run or delay legacy
  evaluation, which never awaits it.
- Test evidence (`__tests__/gaugeAlertSource51D.test.js`): shadow and legacy runs of the same
  scenario produce identical database writes, documents and sends, while RDP alone would trigger.
  The shadow module is pure over deep-frozen inputs.

## Run record additions

`gaugeSource` (`legacy|shadow|rdp|invalid`), `gaugeSources` (per gauge: `source`, `status`
`fresh|stale|no_observations|error`, `error` code, `newestObservedAt`, `ageSeconds`, `rows`,
`rejectedRows`, `conflicts`), `gaugeHoldReasons`, and counters `enrolled`, `gaugeHeld`, `deferred`.
`sourceFailures` now lists `gauge:<key>` per unusable gauge instead of `trent`. A hold or an
unusable gauge makes the run `degraded`.

## Behaviour changes in legacy mode

Merging is effectively a production change for legacy gauge evaluation even with no setting change:

1. Freshness is per measurement, by observed time (≤ 30 min). Previously one stale gauge could
   pass if another gauge in the snapshot was fresh, and the last-successful in-process snapshot
   could be reused.
2. EA is read per exact provider measure, uncached (one request per alerted gauge per 15 min, at most six).
3. A clear and re-crossing between runs now notifies once, when the newest reading still meets
   the rule. A crossing that has already cleared still sends nothing.
4. Retries of uncertain live gauge deliveries wait for the condition to hold.
5. New hold cases are visible as `alertRuns.gaugeHoldReasons`. The likely ones are a triggered
   rule after a source outage longer than 24 h, and an EA reading revised or removed after processing.

On the first run every existing rule records progress with its current state unchanged. In legacy
mode the newest reading is evaluated exactly as before.

## Operator queries and reconciliation (read-only unless approved)

```js
db.alertRuns.find({}, { gaugeSource: 1, gaugeSources: 1, gaugeHoldReasons: 1, enrolled: 1, gaugeHeld: 1, deferred: 1, status: 1, startedAt: 1 }).sort({ startedAt: -1 }).limit(8)
db.alertSubscriptions.find({ gaugeHold: { $exists: true } }, { email: 0, unsubscribeToken: 0 })
```

Re-baseline a reviewed held rule. This is a production write and needs approval. It does not
reset its armed/triggered state, deliveries or keys:

```js
db.alertSubscriptions.updateOne({ alertKey: "<key>", pendingTransitionId: null },
  { $unset: { lastObservedAt: "", lastObservedValue: "", lastObservedSource: "", lastObservedMeasurementId: "", lastObservedState: "", lastObservedTransitionId: "", gaugeHold: "" }, $inc: { stateRevision: 1 } })
```

The next run then records progress from the newest fresh reading, with no crossing on RDP. If
the rule's stored armed/triggered state is itself wrong, correct `lastConditionState` in the same
reviewed update. Do not edit `pendingTransitionId` or deliveries; follow the #47 procedure for those.

## Code rollback

Reverting to the #47 evaluator is safe. It ignores the new fields and evaluates the newest legacy
snapshot as before. Its transitions detach the markers, so when this code returns, rules
reconcile as if newly introduced instead of replaying. Before rolling the *code* back, check for
held/uncertain deliveries as #47 documents.

## Shadow and cutover checklist (for subsequent approval; nothing here is authorised by this PR)

**0. Prerequisites**
- [x] Production read API, Vercel Production OIDC → STS → SigV4 federation and `RDP_*` access
      variables: proven on 2026-11-03 (#51 P7, CloudTrail and read-Lambda 200). Levels shadow is live.
- [x] All six canonical measurements, including the three formerly reserved #52 IDs, enabled in
      RDP: confirmed by the user on 2026-11-03.
- [ ] This PR reviewed and merged. Production runs in legacy mode for a few days with
      `alertRuns` reviewed: no unexplained `gaugeHoldReasons`, `deliveryIndex: "present"`, no
      `held_for_review` or stale `claimed` deliveries (#47 handoff).

The stage/production separation and invalid-setting behaviour are covered by the #51-A client
tests and this PR's fixture tests, so no separate Preview run is required.

**1. Production shadow** (approved setting change + redeploy; legacy stays authoritative)
- [ ] Set only `RDP_GAUGE_ALERTS_SOURCE=shadow` for Production and redeploy. Record the deployment
      ID and the time it took effect. No emails come from the RDP side.
- [ ] After about 48 h, review the `RDP gauge alert shadow comparison` lines the cron already logs
      every 15 minutes (no extra sampler):
      - `decisions.disagreed` and `pendingDisagreed` are 0, or each disagreement is explained;
      - `valueMismatches` is 0 and `rdpHoldReasons` is empty in steady state;
      - RDP `ageSeconds` stays within freshness and `newestLagSeconds` looks reasonable.
      The 24 h window each run compares covers the history check; no separate seven-day sample is needed.
- [ ] Deterministic crossing evidence: this suite's catch-up, hysteresis, source-switch and
      rollback tests pass on the deployed commit. Do not wait for natural crossings.

**2. Activation** (separate approval)
- [ ] Reconciliation plan reviewed: expected `enrolled` count, and held cases from the last shadow
      report (`rdpHoldReasons`) reviewed or accepted.
- [ ] Set only `RDP_GAUGE_ALERTS_SOURCE=rdp` for Production and redeploy. Trent and levels settings are untouched.
- [ ] First runs: `gaugeSource: "rdp"`, no unexpected `sent`, `gaugeHoldReasons` explained.
      Transient `continuity_unproven` while RDP catches up to the last legacy observation should
      clear within one or two runs.

**3. Rollback** (the same source-only redeploy; behaviour is fixture-tested)
- [ ] Remove or set `legacy` only for alerts and redeploy. Expect transient `continuity_unproven` if
      legacy lags, `continuity_conflict` if values disagree, and no rearm, resend or replayed crossing.
- [ ] Unrelated alerts keep running. Delivery and subscription records persist. Held rules are
      reconciled with the query above after review.
