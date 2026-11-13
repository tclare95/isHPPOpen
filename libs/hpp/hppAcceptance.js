// Shadow acceptance summary for the HPP single-writer cutover (#89).
//
// Pure functions only: no I/O or clock. Turns the shadow state, its
// transitions and the legacy openIndicator history into the runbook's
// acceptance checks (docs/HPP-STATUS-SERVICE.md), so an operator can read
// readiness from one report instead of reconstructing it by hand.
//
// A check is "pass", "fail", "pending" (needs more time or a real crossing),
// "review" (a human must explain it) or "info" (reviewed, never blocking).
// Absence of a crossing is "pending", never "fail": the runbook accepts real
// crossings in each direction or an explicitly recorded waiver.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const ACCEPTANCE = Object.freeze({
  // Owner decision (13 Nov 2026): 48 hours of eligible evaluation, not 14 days.
  requiredHours: 48,
  pairToleranceMs: 30 * MINUTE_MS,
  closureDayTolerance: 1,
  unexplainedGapMs: 2 * 60 * MINUTE_MS,
  cadenceMs: 15 * MINUTE_MS,
  minCadenceRatio: 0.95,
});

// Holds that always need a human explanation, however short.
const REVIEW_HOLD_REASONS = new Set([
  "identity_mismatch", "conflict", "rule_mismatch", "orphaned_transition", "sequence_conflict",
]);
const UNRESOLVED_HOLD_REASONS = new Set(["orphaned_transition", "sequence_conflict"]);
const CLOSURE_FIELDS = ["closuresInLast7Days", "closuresInLast28Days", "closuresInLast182Days", "closuresInLast365Days"];

const time = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

/**
 * Legacy status changes written after the service seed, in time order.
 * The scraper writes only on change; consecutive equal values are collapsed
 * defensively so a duplicate legacy row is not counted as a crossing.
 */
export function legacyTransitionsAfter(legacyRecords, afterMs) {
  const valid = legacyRecords
    .map((record) => ({ at: time(record?.timestamp), open: record?.value, id: record?._id == null ? null : String(record._id) }))
    .filter((record) => record.at !== null && typeof record.open === "boolean")
    .sort((a, b) => a.at - b.at);
  const changes = [];
  let previous = null;
  for (const record of valid) {
    if (previous !== null && record.open === previous) continue;
    previous = record.open;
    if (record.at > afterMs) changes.push(record);
  }
  return changes;
}

/**
 * Pair legacy and shadow transitions in order and direction.
 *
 * Legacy timestamps are scraper poll times (observation plus EA publication
 * and poll lag, historically 20–80 minutes after the RDP edge). Shadow
 * transitions carry both the observation time and the evaluation time. A
 * pair is within tolerance when either delta is, and both are reported.
 */
export function pairTransitions(legacy, shadow, toleranceMs = ACCEPTANCE.pairToleranceMs) {
  const service = [...shadow]
    .map((doc) => ({ id: doc._id, sequence: doc.sequence, open: doc.open, observedAt: time(doc.observedAt), evaluatedAt: time(doc.evaluatedAt) }))
    .sort((a, b) => a.sequence - b.sequence);
  const pairs = [];
  const unpairedLegacy = [];
  const unpairedShadow = [];
  let i = 0;
  let j = 0;
  while (i < legacy.length || j < service.length) {
    const l = legacy[i];
    const s = service[j];
    if (l && s && l.open === s.open) {
      const observedDeltaMs = s.observedAt - l.at;
      const evaluatedDeltaMs = s.evaluatedAt === null ? null : s.evaluatedAt - l.at;
      const within = Math.abs(observedDeltaMs) <= toleranceMs ||
        (evaluatedDeltaMs !== null && Math.abs(evaluatedDeltaMs) <= toleranceMs);
      if (within) {
        pairs.push({ open: l.open, legacyAt: iso(l.at), legacyId: l.id, shadowId: s.id, observedAt: iso(s.observedAt),
          evaluatedAt: iso(s.evaluatedAt), observedDeltaMs, evaluatedDeltaMs });
        i += 1;
        j += 1;
        continue;
      }
    }
    // Drop whichever side is earlier as unpaired, then keep walking.
    const shadowAt = s ? s.evaluatedAt ?? s.observedAt : Infinity;
    if (l && (!s || l.at <= shadowAt)) {
      unpairedLegacy.push({ open: l.open, legacyAt: iso(l.at), legacyId: l.id });
      i += 1;
    } else {
      unpairedShadow.push({ open: s.open, shadowId: s.id, observedAt: iso(s.observedAt), evaluatedAt: iso(s.evaluatedAt) });
      j += 1;
    }
  }
  return { pairs, unpairedLegacy, unpairedShadow };
}

/** Recorded gaps plus any open hold, classified for review. */
export function classifyGaps(health, now, evidenceSinceMs) {
  const nowMs = now.getTime();
  const recorded = (health.gaps ?? []).map((gap) => ({ ...gap, open: false }));
  const current = health.holdSince
    ? [{ from: health.holdSince, to: null, reason: health.holdReason ?? null, runs: health.consecutiveHolds ?? 0, open: true }]
    : [];
  return [...recorded, ...current].map((gap) => {
    const from = time(gap.from);
    const to = gap.to === null ? nowMs : time(gap.to);
    const durationMs = from === null || to === null ? null : to - from;
    // Holds that ended before the first eligible run predate the evidence window.
    const preEvidence = !gap.open && (evidenceSinceMs === null || to <= evidenceSinceMs);
    const needsExplanation = !preEvidence &&
      (REVIEW_HOLD_REASONS.has(gap.reason) || durationMs === null || durationMs > ACCEPTANCE.unexplainedGapMs);
    return { ...gap, durationMs, preEvidence, needsExplanation };
  });
}

const check = (id, status, detail) => ({ id, status, detail });

/**
 * Build the acceptance summary.
 * - `state`: shadow state document (with `health` and `seed`).
 * - `transitions`: shadow transition documents for the rule.
 * - `legacyRecords`: legacy openIndicator records (window plus carried-in).
 * - `comparison`: result of compareWithLegacy for the same inputs.
 * - `legacySummary`: `{ count, latest }` of openIndicator, for side-effect review.
 */
export function buildAcceptance({ state, transitions = [], legacyRecords = [], comparison, legacySummary = null, now }) {
  const health = state?.health ?? {};
  const nowMs = now.getTime();
  const sinceMs = time(health.firstEligibleAt);
  const seedMs = time(state?.seed?.timestamp) ?? -Infinity;
  const hours = sinceMs === null ? 0 : (nowMs - sinceMs) / HOUR_MS;

  const legacy = legacyTransitionsAfter(legacyRecords, Math.max(seedMs, sinceMs ?? Infinity));
  const shadow = sinceMs === null ? [] : transitions.filter((doc) => time(doc.observedAt) >= seedMs);
  const pairing = pairTransitions(legacy, shadow);
  const crossings = {
    closed: shadow.filter((doc) => doc.open === false).length,
    opened: shadow.filter((doc) => doc.open === true).length,
    legacyClosed: legacy.filter((record) => !record.open).length,
    legacyOpened: legacy.filter((record) => record.open).length,
  };

  const gaps = classifyGaps(health, now, sinceMs);
  const unexplained = gaps.filter((gap) => gap.needsExplanation);

  // State written before firstRunAt existed: an unbroken hold since the first run dates it.
  const firstRunAt = health.firstRunAt ?? (health.holdSince && health.consecutiveHolds === health.runs ? health.holdSince : null);
  const firstRunMs = time(firstRunAt);
  const expectedRuns = firstRunMs === null ? null : Math.floor((nowMs - firstRunMs) / ACCEPTANCE.cadenceMs) + 1;
  const cadence = { firstRunAt, runs: health.runs ?? 0, expectedRuns,
    ratio: expectedRuns ? Math.min(1, (health.runs ?? 0) / expectedRuns) : null, eligibleRuns: health.eligibleRuns ?? 0 };

  const service = comparison?.service ?? null;
  const legacyStatus = comparison?.legacy ?? null;
  const closureDays = CLOSURE_FIELDS.map((field) => ({
    field, service: service?.[field] ?? null, legacy: legacyStatus?.[field] ?? null,
    difference: service && legacyStatus ? service[field] - legacyStatus[field] : null,
  }));
  const closuresWithin = service && legacyStatus &&
    closureDays.every((entry) => Math.abs(entry.difference) <= ACCEPTANCE.closureDayTolerance);

  const statusAgrees = service && legacyStatus ? service.currentStatus === legacyStatus.currentStatus : null;
  const lastCrossingMs = Math.max(
    ...shadow.map((doc) => time(doc.evaluatedAt) ?? time(doc.observedAt)),
    ...legacy.map((record) => record.at),
    -Infinity,
  );
  const nearCrossing = nowMs - lastCrossingMs <= ACCEPTANCE.pairToleranceMs;

  const sourceAge = {
    lastObservationAgeMs: health.lastObservationAgeMs ?? null,
    maxObservationAgeMs: health.maxObservationAgeMs ?? null,
    distribution: health.observationAges ?? {},
    staleHolds: health.holdReasonCounts?.stale ?? 0,
    holdReasonCounts: health.holdReasonCounts ?? {},
  };

  const currentReason = health.holdSince ? health.holdReason : null;
  const pastUnresolved = Object.keys(health.holdReasonCounts ?? {}).filter((reason) => UNRESOLVED_HOLD_REASONS.has(reason));

  const checks = [
    sinceMs === null
      ? check("evidence_window", "pending", "No eligible evaluation yet; the evidence window has not started")
      : check("evidence_window", hours >= ACCEPTANCE.requiredHours ? "pass" : "pending",
        `${hours.toFixed(1)} of ${ACCEPTANCE.requiredHours} hours since first eligible run ${health.firstEligibleAt}`),
    check("crossings_both_directions", crossings.closed > 0 && crossings.opened > 0 ? "pass" : "pending",
      `${crossings.closed} closing and ${crossings.opened} opening shadow transitions; without both, record a waiver on #89`),
    check("contiguous_sequence", state && sequencesContiguous(transitions, state) ? "pass" : "fail",
      `${transitions.length} transitions, state sequence ${state?.sequence ?? null}`),
    check("gaps_explained", unexplained.length === 0 ? "pass" : "review",
      `${unexplained.length} of ${gaps.length} holds need an explanation (review-class reason or longer than 2 hours)`),
    check("no_unresolved_review_holds", UNRESOLVED_HOLD_REASONS.has(currentReason) ? "fail" : pastUnresolved.length ? "review" : "pass",
      currentReason && UNRESOLVED_HOLD_REASONS.has(currentReason) ? `Holding: ${currentReason}` : `Past: ${pastUnresolved.join(", ") || "none"}`),
    check("current_status_agrees", statusAgrees === null ? "pending" : statusAgrees ? "pass" : nearCrossing ? "pending" : "fail",
      `service ${service?.currentStatus ?? null}, legacy ${legacyStatus?.currentStatus ?? null}`),
    check("transitions_paired", pairing.unpairedLegacy.length + pairing.unpairedShadow.length === 0 ? "pass" : "fail",
      `${pairing.pairs.length} paired, ${pairing.unpairedLegacy.length} legacy-only, ${pairing.unpairedShadow.length} shadow-only`),
    check("closure_days_within_1", closuresWithin === null ? "pending" : closuresWithin ? "pass" : "review",
      closureDays.map((entry) => `${entry.field.replace("closuresInLast", "")} ${entry.difference ?? "n/a"}`).join(", ")),
    check("run_cadence", cadence.ratio === null ? "pending" : cadence.ratio >= ACCEPTANCE.minCadenceRatio ? "pass" : "review",
      `${cadence.runs} of ~${cadence.expectedRuns ?? "?"} expected 15-minute runs since ${cadence.firstRunAt}`),
    check("source_age", "info", `last ${fmtMinutes(sourceAge.lastObservationAgeMs)}, max ${fmtMinutes(sourceAge.maxObservationAgeMs)}, ` +
      `${sourceAge.staleHolds} stale holds`),
    check("no_shadow_side_effects", "info", legacySummary
      ? `openIndicator has ${legacySummary.count} records; latest ${legacySummary.latest?.id ?? "none"} at ${legacySummary.latest?.timestamp ?? "n/a"}`
      : "openIndicator summary unavailable"),
  ];

  const blocking = checks.filter((entry) => !["pass", "info"].includes(entry.status)).map((entry) => entry.id);
  return {
    ready: blocking.length === 0,
    blocking,
    checks,
    window: { since: health.firstEligibleAt ?? null, hours: Number(hours.toFixed(2)), requiredHours: ACCEPTANCE.requiredHours },
    crossings,
    pairing,
    gaps,
    closureDays,
    cadence,
    sourceAge,
    legacy: legacySummary,
  };
}

function sequencesContiguous(transitions, state) {
  const sequences = transitions.map((doc) => doc.sequence).sort((a, b) => a - b);
  return sequences.every((sequence, index) => sequence === index + 1) && sequences.length === state.sequence;
}

const fmtMinutes = (ms) => (ms === null || ms === undefined ? "n/a" : `${(ms / MINUTE_MS).toFixed(1)} min`);

const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * One row per paired/unpaired transition, hold and check, for spreadsheet
 * review or attaching to #89. Read-only; contains no credentials.
 */
export function acceptanceToCsv(acceptance) {
  const header = ["kind", "id", "status_or_open", "from_or_legacy_at", "to_or_observed_at", "evaluated_at", "delta_minutes", "detail"];
  const minutes = (ms) => (ms === null || ms === undefined ? null : (ms / MINUTE_MS).toFixed(1));
  const rows = [
    ...acceptance.checks.map((entry) => ["check", entry.id, entry.status, null, null, null, null, entry.detail]),
    ...acceptance.pairing.pairs.map((pair) => ["pair", pair.shadowId, pair.open ? "open" : "closed", pair.legacyAt, pair.observedAt,
      pair.evaluatedAt, minutes(pair.evaluatedDeltaMs ?? pair.observedDeltaMs), `legacy ${pair.legacyId}`]),
    ...acceptance.pairing.unpairedLegacy.map((entry) => ["legacy_only", entry.legacyId, entry.open ? "open" : "closed", entry.legacyAt, null, null, null, null]),
    ...acceptance.pairing.unpairedShadow.map((entry) => ["shadow_only", entry.shadowId, entry.open ? "open" : "closed", null, entry.observedAt, entry.evaluatedAt, null, null]),
    ...acceptance.gaps.map((gap) => ["hold", gap.reason, gap.open ? "open" : gap.needsExplanation ? "needs_explanation" : gap.preEvidence ? "pre_evidence" : "ok",
      gap.from, gap.to, null, minutes(gap.durationMs), `${gap.runs} runs`]),
    ...acceptance.closureDays.map((entry) => ["closure_days", entry.field, entry.difference, entry.legacy, entry.service, null, null, null]),
  ];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
