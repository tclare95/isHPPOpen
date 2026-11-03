// One non-authoritative HPP evaluation against injected ports (#89).
//
// No Mongo, RDP, AWS or Next imports: the independent runtime composes a
// store and an evidence reader (see services/hpp-status). Nothing here writes
// openIndicator, alert state or notifications.
//
// Single writer: a run first claims a lease on the state document by
// compare-and-set on `revision`; an overlapping run exits without writing.
// Retry safety: transition ids are `${ruleId}#${sequence}`, and a run first
// adopts a transition an interrupted run recorded at the next sequence, so a
// retry can never append a second event for the same change.

import { HPP_RULE_V1, HOLD_REASONS, assessEvidence, decide } from "./hppDecision.js";
import {
  coreState,
  seedStateFromLegacy,
  stateAfterTransition,
  toTransitionDocument,
  transitionId,
} from "./hppHistory.js";

export const RUN_HOLD_REASONS = Object.freeze({
  SOURCE_UNAVAILABLE: "source_unavailable",
  RULE_MISMATCH: "rule_mismatch",
  ORPHANED_TRANSITION: "orphaned_transition",
  SEQUENCE_CONFLICT: "sequence_conflict",
});

// Must exceed the runtime's hard timeout so a live run cannot lose its lease.
export const LEASE_MS = 5 * 60 * 1000;
const MAX_GAPS = 50;

/**
 * Health after one run. A hold streak (hold or reconcile) records when it
 * began; when eligible evaluation resumes the streak becomes a bounded gap
 * entry, which is the continuity evidence for shadow review.
 */
export function nextHealth(previous = {}, { now, action, reason, assessment, sourceError }) {
  const at = now.toISOString();
  const eligible = assessment?.eligible === true;
  const holding = action === "hold" || action === "reconcile";
  let gaps = previous.gaps ?? [];
  if (!holding && previous.holdSince) {
    gaps = [...gaps, { from: previous.holdSince, to: at, reason: previous.holdReason ?? null, runs: previous.consecutiveHolds ?? 0 }]
      .slice(-MAX_GAPS);
  }
  return {
    runs: (previous.runs ?? 0) + 1,
    lastRunAt: at,
    lastAction: action,
    lastReason: reason ?? null,
    lastSourceError: sourceError ?? null,
    lastObservedAt: assessment?.observedAt ?? previous.lastObservedAt ?? null,
    lastEligibleAt: eligible ? at : previous.lastEligibleAt ?? null,
    // Measured source lag at evaluation, for the 30-minute freshness review.
    lastObservationAgeMs: eligible ? now.getTime() - Date.parse(assessment.observedAt) : previous.lastObservationAgeMs ?? null,
    lastLevel: eligible ? assessment.level : previous.lastLevel ?? null,
    holdSince: holding ? previous.holdSince ?? at : null,
    holdReason: holding ? reason ?? null : null,
    consecutiveHolds: holding ? (previous.consecutiveHolds ?? 0) + 1 : 0,
    gaps,
  };
}

async function loadOrSeedState(store, rule) {
  const existing = await store.loadState();
  if (existing) return existing;
  const seed = seedStateFromLegacy(await store.latestLegacyRecord(), rule);
  if (!seed) return null;
  // A concurrent run may seed first; either way the stored document wins.
  await store.insertState({ ...seed, health: {}, lease: null });
  return store.loadState();
}

async function readAssessment(readEvidence, now, rule) {
  try {
    return { assessment: assessEvidence(await readEvidence(now), now, rule) };
  } catch (error) {
    return {
      assessment: { eligible: false, reason: RUN_HOLD_REASONS.SOURCE_UNAVAILABLE },
      sourceError: typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR",
    };
  }
}

/**
 * Evaluate once. Ports:
 * - store: loadState, insertState, compareAndSet(expectedRevision, fields),
 *   findTransition(id), insertTransition(doc) → boolean, latestLegacyRecord.
 * - readEvidence(now) → `{ pageIntegrity, rows }`; may throw `{ code }`.
 *
 * Returns `{ action, reason, persisted, ... }`. Store errors propagate; an
 * unreleased lease simply expires.
 */
export async function runHppShadowEvaluation({ store, readEvidence, now = new Date(), rule = HPP_RULE_V1, runId }) {
  let state = await loadOrSeedState(store, rule);
  if (!state) return { action: "hold", reason: HOLD_REASONS.NO_ESTABLISHED_STATE, persisted: false };

  if (state.lease && Date.parse(state.lease.until) > now.getTime()) {
    return { action: "skipped", reason: "lease_held", persisted: false };
  }
  const lease = { runId: runId ?? now.toISOString(), until: new Date(now.getTime() + LEASE_MS).toISOString() };
  if (!(await store.compareAndSet(state.revision, { lease }))) {
    return { action: "skipped", reason: "lost_race", persisted: false };
  }
  const claimedRevision = state.revision + 1;

  const finish = async (outcome, next = state) => {
    const health = nextHealth(state.health, { now, ...outcome });
    const committed = await store.compareAndSet(claimedRevision, {
      ...coreState(next), sequence: next.sequence, health, lease: null,
    });
    return {
      action: outcome.action,
      reason: outcome.reason ?? null,
      sourceError: outcome.sourceError ?? null,
      transitionId: outcome.transitionId ?? null,
      persisted: committed,
      state: { ...coreState(next), sequence: next.sequence },
      health,
    };
  };

  if (state.ruleId !== rule.ruleId) return finish({ action: "hold", reason: RUN_HOLD_REASONS.RULE_MISMATCH });

  // Adopt a transition recorded by a run that stopped before committing state.
  const pending = await store.findTransition(transitionId(rule.ruleId, state.sequence + 1));
  if (pending) {
    if (!(Date.parse(pending.observedAt) > Date.parse(state.basisAt))) {
      // The basis moved past it without adopting it: ambiguous, keep for review.
      return finish({ action: "hold", reason: RUN_HOLD_REASONS.ORPHANED_TRANSITION });
    }
    state = stateAfterTransition(state, pending);
  }

  const { assessment, sourceError } = await readAssessment(readEvidence, now, rule);
  const result = decide(coreState(state), assessment, now);
  if (result.action !== "transition") {
    return finish({ action: result.action, reason: result.reason, assessment, sourceError }, { ...state, ...result.state });
  }

  const doc = toTransitionDocument(result.transition, { sequence: state.sequence + 1, previous: state });
  let recorded = doc;
  if (!(await store.insertTransition(doc))) {
    const existing = await store.findTransition(doc._id);
    if (!existing || existing.open !== doc.open) {
      return finish({ action: "hold", reason: RUN_HOLD_REASONS.SEQUENCE_CONFLICT, assessment });
    }
    recorded = existing;
  }
  return finish({ action: "transition", assessment, transitionId: recorded._id }, stateAfterTransition(state, recorded));
}
