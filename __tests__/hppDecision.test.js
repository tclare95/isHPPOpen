jest.mock("server-only", () => ({}));

const {
  HOLD_REASONS,
  HPP_RULE_V1,
  assessEvidence,
  decide,
  isOpenAtLevel,
  stateFromOpenIndicator,
  toOpenIndicatorRecord,
} = require("../libs/hpp/hppDecision");
const { calculateHppStatus } = require("../libs/services/hppStatusService");
const { getRdpMeasurement } = require("../libs/rdp/measurements");

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = new Date("2026-11-01T12:00:00.000Z");
const at = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();

const row = (value, observedAt = at(-10 * MIN), overrides = {}) => ({
  measurementId: "ea-colwick-level",
  unit: "mASD",
  datum: "ASD",
  providerMeasureId: "4009-level-stage-i-15_min-mASD",
  sourceId: "ea-flood-monitoring",
  value,
  observedAt,
  ...overrides,
});
const page = (...rows) => ({ pageIntegrity: "verified", rows });
const openState = (basisAt = at(-60 * MIN)) => ({ open: true, basisAt, changedAt: basisAt, provenance: "test" });

// Feed a sequence of polls (page + clock) through decide(), collecting transitions.
function run(state, polls) {
  const transitions = [];
  const actions = [];
  for (const { evidence, now } of polls) {
    const result = decide(state, assessEvidence(evidence, now), now);
    actions.push(result.action);
    if (result.transition) transitions.push(result.transition);
    state = result.state;
  }
  return { state, transitions, actions };
}

describe("HPP rule identity", () => {
  test("matches the registered RDP Colwick level measurement", () => {
    const measure = getRdpMeasurement("4009-level");
    expect(HPP_RULE_V1).toMatchObject({
      measurementId: measure.measurementId,
      unit: measure.unit,
      datum: measure.datum,
      providerMeasureId: measure.providerMeasureId,
    });
  });

  test("is open strictly below 2.2 m and closed at or above it", () => {
    expect(isOpenAtLevel(0)).toBe(true);
    expect(isOpenAtLevel(2.199)).toBe(true);
    expect(isOpenAtLevel(2.2)).toBe(false);
    expect(isOpenAtLevel(2.201)).toBe(false);
  });
});

describe("assessEvidence", () => {
  test("evaluates the newest fresh verified reading", () => {
    const result = assessEvidence(page(row(2.5, at(-40 * MIN)), row(2.2, at(-10 * MIN)), row(2.0, at(-25 * MIN))), NOW);

    expect(result).toEqual({
      eligible: true,
      open: false,
      level: 2.2,
      observedAt: at(-10 * MIN),
      ruleId: HPP_RULE_V1.ruleId,
      measurementId: "ea-colwick-level",
    });
  });

  test.each([
    ["no page", undefined, HOLD_REASONS.MISSING],
    ["empty page", page(), HOLD_REASONS.MISSING],
    ["unverified page", { pageIntegrity: "partial", rows: [row(1)] }, HOLD_REASONS.UNVERIFIED],
    ["other measurement", page(row(1, undefined, { measurementId: "ea-clifton-bridge-level" })), HOLD_REASONS.IDENTITY_MISMATCH],
    ["other unit", page(row(1, undefined, { unit: "m" })), HOLD_REASONS.IDENTITY_MISMATCH],
    ["other datum", page(row(1, undefined, { datum: "unknown" })), HOLD_REASONS.IDENTITY_MISMATCH],
    ["other provider measure", page(row(1, undefined, { providerMeasureId: "4009-level-downstage-i-15_min-mASD" })), HOLD_REASONS.IDENTITY_MISMATCH],
    ["missing identity field", page(row(1, undefined, { sourceId: undefined })), HOLD_REASONS.IDENTITY_MISMATCH],
    ["non-numeric value", page(row("2.1")), HOLD_REASONS.INVALID_VALUE],
    ["NaN value", page(row(Number.NaN)), HOLD_REASONS.INVALID_VALUE],
    ["negative value", page(row(-0.1)), HOLD_REASONS.INVALID_VALUE],
    ["bad observation time", page(row(1, "not-a-date")), HOLD_REASONS.INVALID_VALUE],
    ["conflicting values at one time", page(row(2.1, at(-10 * MIN)), row(2.3, at(-10 * MIN))), HOLD_REASONS.CONFLICT],
    ["future observation", page(row(1, at(6 * MIN))), HOLD_REASONS.FUTURE_OBSERVATION],
    ["stale observation", page(row(1, at(-31 * MIN))), HOLD_REASONS.STALE],
  ])("holds on %s", (_, evidence, reason) => {
    expect(assessEvidence(evidence, NOW)).toMatchObject({ eligible: false, reason });
  });

  test("accepts an identical duplicate, small clock skew and the 30-minute age limit", () => {
    expect(assessEvidence(page(row(2.1, at(-10 * MIN)), row(2.1, at(-10 * MIN))), NOW).eligible).toBe(true);
    expect(assessEvidence(page(row(2.1, at(4 * MIN))), NOW).eligible).toBe(true);
    expect(assessEvidence(page(row(2.1, at(-30 * MIN))), NOW).eligible).toBe(true);
  });
});

describe("decide", () => {
  test("holds without changing state when evidence is ineligible", () => {
    const state = openState();
    for (const evidence of [page(), page(row(2.5, at(-45 * MIN))), page(row(2.5, undefined, { unit: "m" }))]) {
      expect(decide(state, assessEvidence(evidence, NOW), NOW)).toEqual({ action: "hold", reason: expect.any(String), state });
    }
  });

  test("never seeds a status when no state is established", () => {
    expect(decide(null, assessEvidence(page(row(2.5)), NOW), NOW)).toEqual({
      action: "hold",
      reason: HOLD_REASONS.NO_ESTABLISHED_STATE,
      state: null,
    });
  });

  test("records one transition at the observation time, with provenance", () => {
    const result = decide(openState(), assessEvidence(page(row(2.2)), NOW), NOW);

    expect(result.action).toBe("transition");
    expect(result.transition).toEqual({
      open: false,
      observedAt: at(-10 * MIN),
      evaluatedAt: NOW.toISOString(),
      level: 2.2,
      ruleId: HPP_RULE_V1.ruleId,
      measurementId: "ea-colwick-level",
    });
    expect(result.state).toMatchObject({ open: false, basisAt: at(-10 * MIN), changedAt: at(-10 * MIN) });
  });

  test("unchanged status advances the basis without a transition", () => {
    const result = decide(openState(), assessEvidence(page(row(1.5)), NOW), NOW);

    expect(result).toMatchObject({ action: "none", reason: "unchanged", state: { open: true, basisAt: at(-10 * MIN) } });
  });

  test("replayed polls create no duplicate transitions", () => {
    const poll = { evidence: page(row(2.4, at(-10 * MIN))), now: NOW };
    const { transitions, actions } = run(openState(), [poll, poll, { ...poll, now: new Date(NOW.getTime() + 5 * MIN) }]);

    expect(transitions).toHaveLength(1);
    expect(actions).toEqual(["transition", "none", "none"]);
  });

  test("late or out-of-order readings older than the basis are ignored", () => {
    const after = decide(openState(), assessEvidence(page(row(2.4, at(-5 * MIN))), NOW), NOW).state;

    expect(decide(after, assessEvidence(page(row(1.0, at(-20 * MIN))), NOW), NOW)).toMatchObject({ action: "none", reason: "superseded", state: after });
  });

  test("a corrected value at the decision's observation time is held for reconciliation", () => {
    const after = decide(openState(), assessEvidence(page(row(2.4, at(-5 * MIN))), NOW), NOW).state;

    expect(decide(after, assessEvidence(page(row(2.1, at(-5 * MIN))), NOW), NOW)).toEqual({ action: "reconcile", reason: "correction", state: after });
  });

  test("a long stale gap holds, then fresh evidence makes one transition without backfill", () => {
    const polls = [
      ...[1, 2, 3].map((h) => ({ evidence: page(row(1.9, at(-60 * MIN))), now: new Date(NOW.getTime() + h * 60 * MIN) })),
      { evidence: page(row(2.6, at(4 * 60 * MIN))), now: new Date(NOW.getTime() + 4 * 60 * MIN + 10 * MIN) },
    ];

    const { transitions, actions, state } = run(openState(at(-2 * 60 * MIN)), polls);

    expect(actions).toEqual(["hold", "hold", "hold", "transition"]);
    expect(transitions).toHaveLength(1);
    expect(transitions[0].observedAt).toBe(at(4 * 60 * MIN));
    expect(state.open).toBe(false);
  });

  test("reproduces each crossing when the level chatters around 2.2 m, as the legacy rule does", () => {
    const levels = [2.19, 2.2, 2.19, 2.21, 2.21, 2.18];
    const polls = levels.map((level, i) => ({ evidence: page(row(level, at(i * 15 * MIN))), now: new Date(NOW.getTime() + i * 15 * MIN + MIN) }));

    const { transitions } = run(openState(at(-15 * MIN)), polls);

    expect(transitions.map((t) => t.open)).toEqual([false, true, false, true]);
  });
});

describe("legacy continuity", () => {
  test("establishes state from the latest openIndicator record and rejects invalid records", () => {
    expect(stateFromOpenIndicator({ timestamp: new Date("2026-03-15T19:52:22.347Z"), value: true })).toEqual({
      open: true,
      basisAt: "2026-03-15T19:52:22.347Z",
      changedAt: "2026-03-15T19:52:22.347Z",
      provenance: "legacy-openIndicator",
    });
    expect(stateFromOpenIndicator(null)).toBeNull();
    expect(stateFromOpenIndicator({ readingDate: "2024-03-14T20:15:00Z", openIndicatorField: true })).toBeNull();
    expect(stateFromOpenIndicator({ timestamp: new Date(), value: "false" })).toBeNull();
  });

  test("evidence observed before the legacy record's poll time cannot change state", () => {
    const seeded = stateFromOpenIndicator({ timestamp: new Date(at(-5 * MIN)), value: true });

    expect(decide(seeded, assessEvidence(page(row(2.5, at(-10 * MIN))), NOW), NOW)).toMatchObject({ action: "none", reason: "superseded" });
  });

  test("new transitions extend legacy history without breaking the public closure windows", () => {
    const legacy = [
      { timestamp: new Date(NOW.getTime() - 400 * DAY), value: false },
      { timestamp: new Date(NOW.getTime() - 300 * DAY), value: true },
    ];
    let state = stateFromOpenIndicator(legacy.at(-1));
    const appended = [];
    for (const [offset, level] of [[-10 * DAY, 2.4], [-3 * DAY, 2.0]]) {
      const now = new Date(NOW.getTime() + offset + 5 * MIN);
      const result = decide(state, assessEvidence(page(row(level, at(offset))), now), now);
      if (result.transition) appended.push(toOpenIndicatorRecord(result.transition));
      state = result.state;
    }

    expect(appended).toEqual([
      expect.objectContaining({ timestamp: new Date(at(-10 * DAY)), value: false, observedAt: new Date(at(-10 * DAY)), level: 2.4, ruleId: HPP_RULE_V1.ruleId, source: "ea-colwick-level" }),
      expect.objectContaining({ timestamp: new Date(at(-3 * DAY)), value: true }),
    ]);
    expect(calculateHppStatus([...legacy, ...appended], NOW)).toMatchObject({
      currentStatus: true,
      closuresInLast7Days: 4,
      closuresInLast28Days: 7,
      closuresInLast365Days: 72,
    });
  });
});
