// HPP transition identity, history projection and legacy comparison (#89).
//
// Pure functions only: no I/O or clock. Used by the independent HPP status
// service; the web's public reader is unchanged.

import { stateFromOpenIndicator } from "./hppDecision.js";
import { calculateHppStatus } from "./hppWindows.js";

const MINUTE_MS = 60 * 1000;

export const HPP_STATE_ID = "hpp-colwick";
export const SERVICE_PROVENANCE = "hpp-status-service";
export const MAX_RUN_AGE_MS = 45 * MINUTE_MS;

const COMPARED_FIELDS = [
  "currentStatus",
  "closuresInLast7Days",
  "closuresInLast28Days",
  "closuresInLast182Days",
  "closuresInLast365Days",
];

const toIso = (value) => {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

/**
 * Durable transition identity: one transition per state sequence and rule.
 * A retried or overlapping run that reaches the same sequence collides on
 * this id instead of appending a duplicate event.
 */
export const transitionId = (ruleId, sequence) => `${ruleId}#${sequence}`;

/** The core state fields `decide()` reads and returns. */
export const coreState = (state) => ({
  open: state.open,
  basisAt: state.basisAt,
  changedAt: state.changedAt,
  provenance: state.provenance,
});

/**
 * Initial service state from the latest valid legacy openIndicator record.
 * The legacy timestamp is kept verbatim as the basis and as the seed's
 * historical fact; it is never reinterpreted as an observation time.
 */
export function seedStateFromLegacy(record, rule) {
  const basis = stateFromOpenIndicator(record);
  if (!basis) return null;
  return {
    _id: HPP_STATE_ID,
    ruleId: rule.ruleId,
    ...basis,
    sequence: 0,
    revision: 0,
    seed: {
      legacyId: record._id === undefined || record._id === null ? null : String(record._id),
      timestamp: basis.basisAt,
      value: basis.open,
    },
  };
}

/** Durable, non-authoritative record of one service transition. */
export function toTransitionDocument(transition, { sequence, previous }) {
  return {
    _id: transitionId(transition.ruleId, sequence),
    sequence,
    ruleId: transition.ruleId,
    measurementId: transition.measurementId,
    open: transition.open,
    level: transition.level,
    observedAt: transition.observedAt,
    evaluatedAt: transition.evaluatedAt,
    previous: coreState(previous),
    provenance: SERVICE_PROVENANCE,
    authoritative: false,
  };
}

/** State after adopting a recorded transition (its observation time is the new basis). */
export const stateAfterTransition = (state, doc) => ({
  ...state,
  open: doc.open,
  basisAt: doc.observedAt,
  changedAt: doc.observedAt,
  provenance: doc.ruleId,
  sequence: doc.sequence,
});

/**
 * openIndicator-shaped history as the service sees it, for the existing
 * 7/28/182/365-day calculation.
 *
 * Legacy records up to and including the seed keep their original
 * timestamps (scraper poll times) and supply carry-in. Service transitions
 * follow, dated by observation time. Legacy records after the seed belong to
 * the still-authoritative legacy writer and are compared, never merged.
 */
export function projectServiceHistory({ legacyRecords = [], seed, transitions = [] }) {
  const seedTime = Date.parse(seed?.timestamp);
  if (!Number.isFinite(seedTime)) return [];

  const legacy = legacyRecords
    .map((record) => ({ timestamp: toIso(record?.timestamp), value: record?.value }))
    .filter((record) => record.timestamp !== null && Date.parse(record.timestamp) <= seedTime)
    .map((record) => ({ ...record, provenance: "legacy-openIndicator" }));

  const service = [...transitions]
    .sort((a, b) => a.sequence - b.sequence)
    .map((doc) => ({ timestamp: doc.observedAt, value: doc.open, provenance: doc.ruleId, transitionId: doc._id }));

  return [...legacy, ...service];
}

/**
 * Compare the service's projection with the legacy writer's, field by field,
 * using the public status calculation for both. `lastChangedAt` is compared
 * within a tolerance because legacy times are poll times, not observations.
 */
export function compareWithLegacy({ serviceRecords, legacyRecords, now, timeToleranceMs = 30 * MINUTE_MS }) {
  const service = calculateHppStatus(serviceRecords, now);
  const legacy = calculateHppStatus(legacyRecords, now);
  if (!service || !legacy) return { comparable: false, matches: false, differences: [], service, legacy };

  const differences = COMPARED_FIELDS
    .filter((field) => service[field] !== legacy[field])
    .map((field) => ({ field, service: service[field], legacy: legacy[field] }));

  const lastChangedDeltaMs = service.lastChangedAt && legacy.lastChangedAt
    ? Date.parse(service.lastChangedAt) - Date.parse(legacy.lastChangedAt)
    : null;
  const lastChangedDiffers = lastChangedDeltaMs === null
    ? service.lastChangedAt !== legacy.lastChangedAt
    : Math.abs(lastChangedDeltaMs) > timeToleranceMs;
  if (lastChangedDiffers) {
    differences.push({ field: "lastChangedAt", service: service.lastChangedAt, legacy: legacy.lastChangedAt });
  }

  return { comparable: true, matches: differences.length === 0, differences, lastChangedDeltaMs, service, legacy };
}

function serviceStatus(state, now, maxRunAgeMs) {
  if (!state) return "unseeded";
  const lastRun = Date.parse(state.health?.lastRunAt);
  if (!Number.isFinite(lastRun) || now.getTime() - lastRun > maxRunAgeMs) return "run_overdue";
  if (state.health?.holdSince) return "holding";
  return "ok";
}

/**
 * Read-only shadow evidence: last-known state, evidence freshness, recorded
 * hold intervals and the legacy comparison. Safe to expose to operators.
 */
export function buildShadowReport({ state, transitions = [], legacyRecords = [], now, maxRunAgeMs = MAX_RUN_AGE_MS }) {
  const status = serviceStatus(state, now, maxRunAgeMs);
  if (!state) return { status, generatedAt: now.toISOString(), authoritative: false };

  const serviceRecords = projectServiceHistory({ legacyRecords, seed: state.seed, transitions });
  const health = state.health ?? {};
  const sequences = transitions.map((doc) => doc.sequence).sort((a, b) => a - b);
  return {
    status,
    generatedAt: now.toISOString(),
    authoritative: false,
    ruleId: state.ruleId,
    lastKnown: { ...coreState(state), sequence: state.sequence },
    seed: state.seed,
    evidence: {
      lastRunAt: health.lastRunAt ?? null,
      lastAction: health.lastAction ?? null,
      lastReason: health.lastReason ?? null,
      lastSourceError: health.lastSourceError ?? null,
      lastObservedAt: health.lastObservedAt ?? null,
      lastEligibleAt: health.lastEligibleAt ?? null,
      lastObservationAgeMs: health.lastObservationAgeMs ?? null,
      holdSince: health.holdSince ?? null,
      consecutiveHolds: health.consecutiveHolds ?? 0,
      runs: health.runs ?? 0,
    },
    continuity: {
      gaps: health.gaps ?? [],
      transitions: transitions.length,
      sequences,
      // Every recorded transition 1..n is present and the state has adopted the last.
      contiguous: sequences.every((sequence, index) => sequence === index + 1) &&
        sequences.length === state.sequence,
    },
    comparison: compareWithLegacy({ serviceRecords, legacyRecords, now }),
  };
}
