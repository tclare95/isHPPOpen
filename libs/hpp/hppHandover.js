// Operator handovers of openIndicator between the legacy scraper and the app (#89).
//
// Pure planning: no I/O or clock. scripts/hpp-writer.mjs reads the inputs,
// prints the plan, and applies it only with --apply (hppAuthoritativeStore.js
// applyHandover, compare-and-set on the control epoch and state revision).
//
// To app: reconcile first. The latest openIndicator record L must be the one
// the operator named, and the shadow service must be fresh, not holding, and
// agree with L. Authoritative state is then seeded from L, keeping L's
// timestamp, and continues the transition sequence of any earlier activation
// so `${ruleId}#${sequence}` ids never repeat.
//
// To legacy: always allowed from app. Records the app wrote stay as history.

import { HPP_STATE_ID, MAX_RUN_AGE_MS } from "./hppHistory.js";
import { OWNERS, WRITER_CONTROL_ID, ownerOf } from "./hppWriterControl.js";

const MAX_HISTORY = 20;

const iso = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

function nextControl(control, owner, now, extra = {}) {
  const epoch = (control?.epoch ?? 0) + 1;
  const switchedAt = now.toISOString();
  return {
    _id: WRITER_CONTROL_ID,
    owner,
    epoch,
    switchedAt,
    previousOwner: ownerOf(control),
    legacyAck: null,
    history: [...(control?.history ?? []), { owner, epoch, switchedAt }].slice(-MAX_HISTORY),
    ...extra,
  };
}

/**
 * Plan the handover from legacy to the app. Returns
 * `{ ok: true, control, state }` or `{ ok: false, refusals: [...] }`.
 */
export function planHandoverToApp({ control, latest, expectLatestId, shadowState, authoritativeState, maxAppSequence = 0, rule, now }) {
  const refusals = [];
  if (ownerOf(control) === OWNERS.APP) refusals.push("already_app");

  const latestAt = iso(latest?.timestamp);
  if (!latest || latestAt === null || typeof latest.value !== "boolean") refusals.push("latest_record_invalid");
  else if (String(latest._id) !== String(expectLatestId)) refusals.push("latest_record_unexpected");

  const health = shadowState?.health ?? {};
  if (!shadowState) refusals.push("shadow_missing");
  else {
    if (shadowState.ruleId !== rule.ruleId) refusals.push("shadow_rule_mismatch");
    const lastEligible = Date.parse(health.lastEligibleAt);
    if (!Number.isFinite(lastEligible) || now.getTime() - lastEligible > MAX_RUN_AGE_MS) refusals.push("shadow_not_fresh");
    if (health.holdSince) refusals.push("shadow_holding");
    if (latest && typeof latest.value === "boolean" && shadowState.open !== latest.value) refusals.push("shadow_disagrees_with_latest");
  }

  const lease = authoritativeState?.lease;
  if (lease && Date.parse(lease.until) > now.getTime()) refusals.push("authoritative_lease_held");
  if (refusals.length) return { ok: false, refusals };

  const newControl = nextControl(control, OWNERS.APP, now, {
    reconciled: { id: String(latest._id), timestamp: latestAt, value: latest.value },
  });
  const sequence = Math.max(authoritativeState?.sequence ?? 0, maxAppSequence);
  const fromApp = latest.ruleId === rule.ruleId && Number.isInteger(latest.sequence);
  const state = {
    _id: HPP_STATE_ID,
    ruleId: rule.ruleId,
    open: latest.value,
    basisAt: latestAt,
    changedAt: latestAt,
    provenance: fromApp ? rule.ruleId : "legacy-openIndicator",
    sequence,
    epoch: newControl.epoch,
    seed: { legacyId: String(latest._id), timestamp: latestAt, value: latest.value, sequence },
    revision: authoritativeState ? authoritativeState.revision + 1 : 0,
    lease: null,
    health: {},
  };
  return { ok: true, control: newControl, state, expected: { epoch: control?.epoch ?? null, revision: authoritativeState?.revision ?? null } };
}

/** Plan the reverse handover (rollback) from the app to legacy. */
export function planHandoverToLegacy({ control, now }) {
  if (ownerOf(control) !== OWNERS.APP) return { ok: false, refusals: ["not_app"] };
  return { ok: true, control: nextControl(control, OWNERS.LEGACY, now), state: null, expected: { epoch: control.epoch, revision: null } };
}
