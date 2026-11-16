// Pure water-quality ("CSO risk") alert decisions for the RDP assessment (RDP_WQ_ASSESSMENT=rdp). No I/O.
// See docs/RDP-WATER-QUALITY-ASSESSMENT.md#alerts.
//
// Rules are unchanged: `riskLevel` amber = Elevated, red = High, on the upstream storm-overflow factor (as before).
// - Trigger only on what the evidence proves (`lowest`); re-arm only when the evidence rules the level out (`highest`).
// - Unavailable evidence is a skip: no trigger, no re-arm.
// - A rule whose state was produced by another assessment version is enrolled first, without a transition. If the new
//   assessment already meets (or cannot rule out) the rule's level, the rule stays quiet until the new assessment has
//   cleared once. A source or version switch therefore never sends a notification by itself.

export const WQ_RISK_RANK = Object.freeze({ green: 0, amber: 1, red: 2 });
const stateOf = (rule) => (rule.lastConditionState === "triggered" ? "triggered" : "armed");

/** A confirmed rule that has never been evaluated has no existing state to reconcile. */
const isNewRule = (rule) => !rule.lastEvaluatedAt && !rule.lastTriggeredAt && !rule.lastTransitionId && !rule.wqAssessment;

/**
 * The rule's assessment marker for `version`, or null when there is none, it is for another version, or it is detached
 * (another writer, such as legacy-mode evaluation after a rollback, changed the state it was written with).
 */
export function assessmentMarker(rule, version) {
  const marker = rule.wqAssessment;
  if (!marker || marker.version !== version) return null;
  if (marker.state !== stateOf(rule) || (marker.transitionId ?? null) !== (rule.lastTransitionId ?? null)) return null;
  return marker;
}

/**
 * Decide one water-quality rule. `risk` is `{ lowest, highest, at }` from `alertRisk()`, or null when unavailable.
 * Returns `{ kind, reason?, value?, suppressUntilClear? }` with kind one of skip | enrol | advance | unchanged | rearm | trigger.
 */
export function decideWaterQualityRule(rule, risk, version) {
  const target = WQ_RISK_RANK[rule.riskLevel];
  if (target === undefined) return { kind: "skip", reason: "invalid_rule" };
  if (!risk || WQ_RISK_RANK[risk.lowest] === undefined || WQ_RISK_RANK[risk.highest] === undefined) return { kind: "skip", reason: "unavailable" };
  const met = WQ_RISK_RANK[risk.lowest] >= target;
  const clear = WQ_RISK_RANK[risk.highest] < target;
  const state = stateOf(rule);
  const marker = assessmentMarker(rule, version);

  if (!marker) {
    if (isNewRule(rule)) return met ? { kind: "trigger", value: risk.lowest, suppressUntilClear: false } : { kind: "enrol", reason: "new_rule", suppressUntilClear: false };
    return { kind: "enrol", reason: "assessment_changed", suppressUntilClear: state === "armed" && !clear };
  }
  if (marker.suppressUntilClear) return clear ? { kind: "advance", reason: "baseline_cleared", suppressUntilClear: false } : { kind: "unchanged", reason: "baseline_held" };
  if (state === "triggered" && clear) return { kind: "rearm", suppressUntilClear: false };
  if (state === "armed" && met) return { kind: "trigger", value: risk.lowest, suppressUntilClear: false };
  return { kind: "unchanged" };
}

/** Counts of what each rule would do, for the read-only shadow report. */
export function summariseWaterQualityDecisions(rules, risk, version) {
  const counts = {};
  for (const rule of rules) {
    const { kind, reason } = decideWaterQualityRule(rule, risk, version);
    const key = reason ? `${kind}:${reason}` : kind;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
