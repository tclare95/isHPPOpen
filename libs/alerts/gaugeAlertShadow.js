import { decideGaugeRule, describeGaugeRead, gaugeRetryGate, isLiveGaugeRule, sameValue } from "./gaugeAlertDecision";

// Read-only RDP shadow comparison for live gauge alerts (#51 Slice D). Pure: it receives the
// rules as they were before the authoritative run plus both reads, and returns a report. It has
// no database handle and no mailer, so it cannot change subscriptions, progress, run records or
// deliveries, or send anything. Reports hold no email addresses, alert keys or tokens.

const MAX_SAMPLES = 10;

function compareObservations(legacy, rdp) {
  if (!legacy?.ok || !rdp?.ok) return null;
  const legacyByTime = new Map(legacy.observations.map((observation) => [observation.time, observation]));
  const rdpByTime = new Map(rdp.observations.map((observation) => [observation.time, observation]));
  const bothHave = legacy.observations.length && rdp.observations.length;
  // Unmatched timestamps are counted only where both series overlap, so lag is not double-counted.
  const from = bothHave ? Math.max(legacy.observations[0].time, rdp.observations[0].time) : 0;
  const to = bothHave ? Math.min(legacy.observations.at(-1).time, rdp.observations.at(-1).time) : -1;
  const inOverlap = (time) => time >= from && time <= to;

  let matchedTimestamps = 0;
  const valueMismatches = [];
  for (const [time, observation] of legacyByTime) {
    const other = rdpByTime.get(time);
    if (!other) continue;
    matchedTimestamps += 1;
    if (!sameValue(observation.value, other.value)) valueMismatches.push({ observedAt: observation.at, legacy: observation.value, rdp: other.value });
  }
  return {
    matchedTimestamps,
    valueMismatches: valueMismatches.length,
    valueMismatchSamples: valueMismatches.slice(0, MAX_SAMPLES),
    legacyOnly: [...legacyByTime.keys()].filter((time) => inOverlap(time) && !rdpByTime.has(time)).length,
    rdpOnly: [...rdpByTime.keys()].filter((time) => inOverlap(time) && !legacyByTime.has(time)).length,
    // Positive: legacy's newest observation is later than RDP's (RDP lags).
    newestLagSeconds: bothHave ? Math.round((legacy.observations.at(-1).time - rdp.observations.at(-1).time) / 1000) : null,
  };
}

const label = (decision) => (decision.reason ? `${decision.kind}:${decision.reason}` : decision.kind);

function sameDecision(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "trigger") return true;
  // Same logical transition: equal observed instant and value give the same delivery identity.
  return left.observation.time === right.observation.time && sameValue(left.observation.value, right.observation.value);
}

/**
 * @param {object} input
 * @param {object[]} input.rules subscriptions as read before the authoritative evaluation
 * @param {Map} input.legacy authoritative legacy reads by gauge key
 * @param {Map|null} input.rdp shadow RDP reads by gauge key (null when the shadow read failed)
 * @param {Date} input.now evaluation time
 */
export function compareGaugeAlertShadow({ rules, legacy, rdp, now }) {
  const liveRules = rules.filter(isLiveGaugeRule);
  const gaugeKeys = [...new Set(liveRules.map((rule) => rule.gaugeKey))];
  const gauges = Object.fromEntries(gaugeKeys.map((key) => {
    const legacyRead = legacy?.get(key);
    const rdpRead = rdp?.get(key);
    return [key, { legacy: describeGaugeRead(legacyRead, now), rdp: describeGaugeRead(rdpRead, now), comparison: compareObservations(legacyRead, rdpRead) }];
  }));

  const decisions = { compared: 0, agreed: 0, disagreed: 0, pendingCompared: 0, pendingDisagreed: 0, pairs: {}, rdpHoldReasons: {}, rdpSkipReasons: {}, lateClearedCrossings: { legacy: 0, rdp: 0 }, samples: [] };
  const tally = (bucket, key) => { bucket[key] = (bucket[key] || 0) + 1; };

  for (const rule of liveRules) {
    const legacyRead = legacy?.get(rule.gaugeKey);
    const rdpRead = rdp?.get(rule.gaugeKey);
    const ruleView = { gaugeKey: rule.gaugeKey, direction: rule.direction, threshold: rule.threshold, state: rule.lastConditionState || "armed" };

    if (rule.pendingTransitionId) {
      const legacyRetry = gaugeRetryGate(rule, legacyRead, now);
      const rdpRetry = gaugeRetryGate(rule, rdpRead, now);
      decisions.pendingCompared += 1;
      if (legacyRetry.allowed !== rdpRetry.allowed) {
        decisions.pendingDisagreed += 1;
        if (decisions.samples.length < MAX_SAMPLES) decisions.samples.push({ ...ruleView, pending: true, legacy: legacyRetry.reason || "retry", rdp: rdpRetry.reason || "retry" });
      }
      continue;
    }

    const legacyDecision = decideGaugeRule(rule, legacyRead, now);
    const rdpDecision = decideGaugeRule(rule, rdpRead, now);
    decisions.compared += 1;
    if (legacyDecision.lateCleared) decisions.lateClearedCrossings.legacy += 1;
    if (rdpDecision.lateCleared) decisions.lateClearedCrossings.rdp += 1;
    if (rdpDecision.kind === "hold") tally(decisions.rdpHoldReasons, rdpDecision.reason);
    if (rdpDecision.kind === "skip") tally(decisions.rdpSkipReasons, rdpDecision.reason);

    if (sameDecision(legacyDecision, rdpDecision)) {
      decisions.agreed += 1;
      continue;
    }
    decisions.disagreed += 1;
    tally(decisions.pairs, `${label(legacyDecision)} -> ${label(rdpDecision)}`);
    if (decisions.samples.length < MAX_SAMPLES) decisions.samples.push({ ...ruleView, legacy: label(legacyDecision), rdp: label(rdpDecision) });
  }

  return { comparedAt: now.toISOString(), rdpRead: rdp ? "completed" : "failed", gauges, decisions };
}
