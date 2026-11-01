// HPP status decisions from verified Colwick observations (#89).
//
// Pure functions only: no I/O, clock, storage, scheduling or notification.
// Callers supply evidence, the established state and `now`, then decide
// what to persist. Kept free of imports so it can move unchanged into the
// eventual HPP service. RDP owns observations; this module owns the HPP rule.

const MINUTE_MS = 60 * 1000;

// The legacy Node scraper rule: open strictly below 2.2 m, closed at or above,
// on the station 4009 level (mASD). Changing any value requires a new ruleId.
export const HPP_RULE_V1 = Object.freeze({
  ruleId: "hpp-colwick-level-2.2m-v1",
  measurementId: "ea-colwick-level",
  unit: "mASD",
  datum: "ASD",
  providerMeasureId: "4009-level-stage-i-15_min-mASD",
  sourceId: "ea-flood-monitoring",
  closedAtOrAboveMetres: 2.2,
  maxObservationAgeMs: 30 * MINUTE_MS,
  maxFutureSkewMs: 5 * MINUTE_MS,
});

export const HOLD_REASONS = Object.freeze({
  MISSING: "missing",
  UNVERIFIED: "unverified",
  IDENTITY_MISMATCH: "identity_mismatch",
  INVALID_VALUE: "invalid_value",
  FUTURE_OBSERVATION: "future_observation",
  STALE: "stale",
  CONFLICT: "conflict",
  NO_ESTABLISHED_STATE: "no_established_state",
});

const IDENTITY_FIELDS = ["measurementId", "unit", "datum", "providerMeasureId", "sourceId"];

const toTime = (value) => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** true = open, matching openIndicator `value`. */
export function isOpenAtLevel(levelMetres, rule = HPP_RULE_V1) {
  return levelMetres < rule.closedAtOrAboveMetres;
}

/**
 * Decide whether an RDP observations page can drive an HPP decision.
 *
 * `page` is `{ pageIntegrity, rows }`, with rows as returned by the RDP
 * observations endpoint. Only the newest row is evaluated, as the legacy
 * writer did; every row must still match the rule's measurement identity.
 */
export function assessEvidence(page, now, rule = HPP_RULE_V1) {
  const rows = Array.isArray(page?.rows) ? page.rows : [];
  if (rows.length === 0) return { eligible: false, reason: HOLD_REASONS.MISSING };
  if (page.pageIntegrity !== "verified") return { eligible: false, reason: HOLD_REASONS.UNVERIFIED };
  if (rows.some((row) => IDENTITY_FIELDS.some((field) => row?.[field] !== rule[field]))) {
    return { eligible: false, reason: HOLD_REASONS.IDENTITY_MISMATCH };
  }

  const nowTime = toTime(now);
  const timed = rows.map((row) => ({ row, time: toTime(row.observedAt) }));
  if (nowTime === null || timed.some(({ row, time }) => time === null || typeof row.value !== "number" ||
      !Number.isFinite(row.value) || row.value < 0)) {
    return { eligible: false, reason: HOLD_REASONS.INVALID_VALUE };
  }

  const byTime = new Map();
  for (const { row, time } of timed) {
    if (byTime.has(time) && byTime.get(time) !== row.value) {
      return { eligible: false, reason: HOLD_REASONS.CONFLICT };
    }
    byTime.set(time, row.value);
  }

  const newest = timed.reduce((a, b) => (b.time > a.time ? b : a));
  if (newest.time > nowTime + rule.maxFutureSkewMs) {
    return { eligible: false, reason: HOLD_REASONS.FUTURE_OBSERVATION };
  }
  if (nowTime - newest.time > rule.maxObservationAgeMs) {
    return { eligible: false, reason: HOLD_REASONS.STALE, observedAt: new Date(newest.time).toISOString() };
  }

  return {
    eligible: true,
    open: isOpenAtLevel(newest.row.value, rule),
    level: newest.row.value,
    observedAt: new Date(newest.time).toISOString(),
    ruleId: rule.ruleId,
    measurementId: rule.measurementId,
  };
}

/**
 * Establish state from the latest legacy openIndicator record. Legacy
 * timestamps are scraper poll times, so they become the basis that later
 * evidence must be newer than; they are never treated as observation times.
 * Returns null when the record cannot establish a state.
 */
export function stateFromOpenIndicator(record) {
  const time = toTime(record?.timestamp);
  if (time === null || typeof record?.value !== "boolean") return null;
  const at = new Date(time).toISOString();
  return { open: record.value, basisAt: at, changedAt: at, provenance: "legacy-openIndicator" };
}

/**
 * Apply one assessment to the established state.
 *
 * Returns `{ action, reason?, state, transition? }` where action is:
 * - "hold": evidence or state cannot support a decision; state unchanged.
 * - "none": no change (unchanged status, replay, or late/older evidence).
 * - "reconcile": evidence contradicts the established basis at the same
 *   time (a correction); held for review, never rewritten automatically.
 * - "transition": exactly one new status change, stamped with its
 *   observation time (no synthetic crossings across any gap).
 */
export function decide(state, assessment, now) {
  if (!assessment?.eligible) {
    return { action: "hold", reason: assessment?.reason ?? HOLD_REASONS.MISSING, state };
  }
  if (!state || typeof state.open !== "boolean" || toTime(state.basisAt) === null) {
    return { action: "hold", reason: HOLD_REASONS.NO_ESTABLISHED_STATE, state };
  }

  const observedTime = toTime(assessment.observedAt);
  const basisTime = toTime(state.basisAt);

  if (observedTime < basisTime) return { action: "none", reason: "superseded", state };
  if (observedTime === basisTime) {
    return assessment.open === state.open
      ? { action: "none", reason: "replay", state }
      : { action: "reconcile", reason: "correction", state };
  }
  if (assessment.open === state.open) {
    return { action: "none", reason: "unchanged", state: { ...state, basisAt: assessment.observedAt } };
  }

  const transition = {
    open: assessment.open,
    observedAt: assessment.observedAt,
    evaluatedAt: new Date(toTime(now)).toISOString(),
    level: assessment.level,
    ruleId: assessment.ruleId,
    measurementId: assessment.measurementId,
  };
  return {
    action: "transition",
    transition,
    state: { open: assessment.open, basisAt: assessment.observedAt, changedAt: assessment.observedAt, provenance: assessment.ruleId },
  };
}

/**
 * openIndicator-compatible record for a transition. `timestamp`/`value` keep
 * the existing reader contract; the remaining fields are additive provenance.
 */
export function toOpenIndicatorRecord(transition) {
  return {
    timestamp: new Date(transition.observedAt),
    value: transition.open,
    observedAt: new Date(transition.observedAt),
    evaluatedAt: new Date(transition.evaluatedAt),
    level: transition.level,
    ruleId: transition.ruleId,
    source: transition.measurementId,
  };
}
