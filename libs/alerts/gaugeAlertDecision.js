// Pure live-gauge alert decisions (#51 Slice D). No I/O and no database access: the same
// functions drive the authoritative evaluator and the read-only RDP shadow comparison.
// See docs/RDP-GAUGE-ALERTS-51D.md for the rules and the chosen bounds.

/** The newest eligible observation must be no older than this (observed time, not fetch time). */
export const GAUGE_ALERT_FRESHNESS_MS = 30 * 60 * 1000;
/** Catch-up window read for every gauge: 96 readings at the EA 15-minute cadence. */
export const GAUGE_ALERT_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Twice the expected rows in the window; more means an abnormal series, so affected rules hold. */
export const GAUGE_ALERT_ROW_BUDGET = 192;
export const GAUGE_ALERT_SOURCE_MODES = Object.freeze(["legacy", "shadow", "rdp"]);

// Source decimals are compared exactly, within binary representational precision only.
const VALUE_EPSILON = 1e-9;

/** `RDP_GAUGE_ALERTS_SOURCE`, read once per run. Absent means legacy; an invalid value returns null. */
export function getGaugeAlertSourceMode(env = process.env) {
  const mode = env.RDP_GAUGE_ALERTS_SOURCE ?? "legacy";
  return GAUGE_ALERT_SOURCE_MODES.includes(mode) ? mode : null;
}

export const isLiveGaugeRule = (rule) => (rule.alertType || "gauge") === "gauge" && rule.source === "live";
export const sameValue = (left, right) => Math.abs(left - right) <= VALUE_EPSILON;

/** EA `dateTime` format (`2026-11-01T12:00:00Z`) for any parseable instant, so equal instants share one transition identity. */
export function normalizeObservedAt(value) {
  return new Date(value).toISOString().replace(/\.000Z$/, "Z");
}

const stateOf = (rule) => (rule.lastConditionState === "triggered" ? "triggered" : "armed");
const measureTypeOf = (rule) => rule.measureType ?? (String(rule.gaugeKey).endsWith("-flow") ? "flow" : "level");

/** Existing threshold and hysteresis rule, unchanged: 0.03 m for level and 1 m³/s for flow. */
export function thresholdState(rule, value) {
  const margin = measureTypeOf(rule) === "flow" ? 1 : 0.03;
  const below = rule.direction === "below";
  return {
    met: below ? value <= rule.threshold : value >= rule.threshold,
    clear: below ? value >= rule.threshold + margin : value <= rule.threshold - margin,
  };
}

/**
 * The rule's observation-progress marker, or null when there is none or it is detached. A marker
 * is attached only while the stored condition state and transition still match the ones written
 * with it; a writer that does not maintain markers (pre-Slice-D code, an operator) detaches it.
 */
export function progressMarker(rule) {
  if (!rule.lastObservedAt) return null;
  const attached = rule.lastObservedState === stateOf(rule) && (rule.lastObservedTransitionId ?? null) === (rule.lastTransitionId ?? null);
  if (!attached) return null;
  return { at: rule.lastObservedAt, time: Date.parse(rule.lastObservedAt), value: rule.lastObservedValue, source: rule.lastObservedSource, measurementId: rule.lastObservedMeasurementId };
}

/** A confirmed rule that has never been evaluated has no existing state to reconcile. */
const isNewRule = (rule) => !rule.lastEvaluatedAt && !rule.lastTriggeredAt && !rule.lastTransitionId && !rule.lastObservedAt;

const skip = (reason) => ({ kind: "skip", reason });
const hold = (reason) => ({ kind: "hold", reason });

/** Freshness and same-timestamp conflict checks shared by evaluation and delivery retries. */
function usableLatest(read, now) {
  if (!read) return { failure: skip("unavailable") };
  if (!read.ok) return { failure: read.error === "CATCHUP_BUDGET_EXCEEDED" ? hold("catchup_budget_exceeded") : skip(read.error || "unavailable") };
  const latest = read.observations.at(-1);
  if (!latest) return { failure: skip("no_observations") };
  if (now.getTime() - latest.time > GAUGE_ALERT_FRESHNESS_MS) return { failure: skip("stale") };
  return { latest };
}

/**
 * Decide what one live gauge rule should do with one alert-safe read. Returns one of:
 * - `skip`: source unavailable, invalid or stale; no trigger, rearm or progress.
 * - `hold`: continuity or history is ambiguous; no trigger, rearm or progress until evidence or reconciliation.
 * - `unchanged`: no observation newer than the marker.
 * - `enrol`: record the first marker without generating a transition.
 * - `advance`: newer observations processed, condition state unchanged.
 * - `rearm` / `trigger`: a transition, carrying the newest observation as progress.
 */
export function decideGaugeRule(rule, read, now) {
  const { latest, failure } = usableLatest(read, now);
  if (failure) return failure;

  const marker = progressMarker(rule);
  const floor = marker ? Math.min(marker.time, latest.time) : latest.time;
  if (read.conflicts.some((time) => time >= floor)) return hold("conflicting_history");

  const progress = { at: latest.at, value: latest.value, source: read.source, measurementId: read.measurementId };
  const initial = stateOf(rule);
  const latestState = thresholdState(rule, latest.value);

  if (!marker) {
    // Existing state was produced by the legacy evaluator. On the same source, evaluating the newest
    // reading is exactly what that evaluator did; on a different source it cannot be proven, so the
    // first marker is recorded without a crossing or rearm.
    if (!isNewRule(rule) && read.source !== "legacy") return { kind: "enrol", reason: "unverified_state", progress };
    if (initial === "armed" && latestState.met) return { kind: "trigger", progress, observation: latest };
    if (initial === "triggered" && latestState.clear) return { kind: "rearm", progress };
    return { kind: "enrol", reason: isNewRule(rule) ? "new_rule" : "existing_state", progress };
  }

  if (marker.measurementId && marker.measurementId !== read.measurementId) return hold("measurement_changed");
  const markerObservation = read.observations.find((observation) => observation.time === marker.time);
  if (markerObservation && !sameValue(markerObservation.value, marker.value)) return hold("continuity_conflict");
  if (!markerObservation) {
    // A newer timestamp alone never proves continuity across a source switch.
    if (marker.source !== read.source) return hold("continuity_unproven");
    if (marker.time >= Date.parse(read.windowStart)) return hold("marker_missing");
  }

  const newer = read.observations.filter((observation) => observation.time > marker.time);
  if (newer.length === 0) return { kind: "unchanged" };

  // Bounded chronological catch-up with the existing hysteresis.
  let state = initial;
  let cleared = false;
  for (const observation of newer) {
    const next = thresholdState(rule, observation.value);
    if (state === "triggered" && next.clear) {
      state = "armed";
      cleared = true;
    } else if (state === "armed" && next.met) {
      state = "triggered";
    }
  }

  // The marker is older than the window. Armed rules depend only on the newest reading, but a
  // triggered rule may have cleared and crossed again inside the unread gap.
  if (!markerObservation && initial === "triggered" && !cleared) return hold("catchup_window_exceeded");

  const newCrossing = state === "triggered" && (initial === "armed" || cleared);
  // Notify only while the newest eligible fresh observation still meets the rule. A crossing that
  // has already fallen back is not committed, so the rule stays armed for the next real one.
  if (newCrossing && latestState.met) return { kind: "trigger", progress, observation: latest, replayed: newer.length };
  const finalState = newCrossing ? "armed" : state;
  if (initial === "triggered" && finalState === "armed") return { kind: "rearm", progress, replayed: newer.length };
  return { kind: "advance", progress, replayed: newer.length, lateCleared: newCrossing };
}

/** A pending live-gauge delivery is re-sent only while the newest eligible fresh observation still meets the rule. */
export function gaugeRetryGate(rule, read, now) {
  const { latest, failure } = usableLatest(read, now);
  if (failure) return { allowed: false, reason: failure.reason };
  if (read.conflicts.includes(latest.time)) return { allowed: false, reason: "conflicting_history" };
  return thresholdState(rule, latest.value).met ? { allowed: true } : { allowed: false, reason: "condition_not_met" };
}

/** Non-sensitive per-gauge read diagnostics for run records and shadow reports. */
export function describeGaugeRead(read, now) {
  if (!read) return { status: "unavailable" };
  if (!read.ok) return { source: read.source, status: "error", error: read.error };
  const latest = read.observations.at(-1);
  if (!latest) return { source: read.source, status: "no_observations", rows: 0, rejectedRows: read.rejectedRows };
  const ageSeconds = Math.floor((now.getTime() - latest.time) / 1000);
  return {
    source: read.source,
    status: ageSeconds * 1000 > GAUGE_ALERT_FRESHNESS_MS ? "stale" : "fresh",
    newestObservedAt: latest.at,
    ageSeconds,
    rows: read.observations.length,
    rejectedRows: read.rejectedRows,
    conflicts: read.conflicts.length,
  };
}
