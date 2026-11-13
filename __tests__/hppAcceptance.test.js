/** @jest-environment node */
import { acceptanceToCsv, buildAcceptance, legacyTransitionsAfter, pairTransitions } from "../libs/hpp/hppAcceptance";
import { compareWithLegacy, projectServiceHistory } from "../libs/hpp/hppHistory";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const SEED_AT = "2026-03-15T19:52:22.347Z";
const FIRST_RUN = new Date("2026-11-03T13:07:33.000Z");
const ELIGIBLE = new Date("2026-11-14T10:07:33.000Z");
const t = (ms) => new Date(ELIGIBLE.getTime() + ms).toISOString();

const seedRecord = { _id: "seed", timestamp: new Date(SEED_AT), value: true };
const shadowTx = (sequence, open, observedMs, evaluatedMs) => ({
  _id: `hpp-colwick-level-2.2m-v1#${sequence}`, sequence, ruleId: "hpp-colwick-level-2.2m-v1", open,
  observedAt: t(observedMs), evaluatedAt: t(evaluatedMs),
});

function stateWith({ sequence = 0, health = {} } = {}) {
  return {
    _id: "hpp-colwick", ruleId: "hpp-colwick-level-2.2m-v1", open: true, basisAt: SEED_AT, changedAt: SEED_AT,
    sequence, seed: { legacyId: "seed", timestamp: SEED_AT, value: true },
    health: {
      runs: 100000, firstRunAt: FIRST_RUN.toISOString(), firstEligibleAt: ELIGIBLE.toISOString(), eligibleRuns: 10,
      gaps: [{ from: FIRST_RUN.toISOString(), to: ELIGIBLE.toISOString(), reason: "identity_mismatch", runs: 955 }],
      ...health,
    },
  };
}

function acceptanceFor({ state, transitions = [], legacy = [], now }) {
  const legacyRecords = [seedRecord, ...legacy];
  const serviceRecords = projectServiceHistory({ legacyRecords, seed: state.seed, transitions });
  const comparison = compareWithLegacy({ serviceRecords, legacyRecords, now });
  return buildAcceptance({ state, transitions, legacyRecords, comparison, now, legacySummary: { count: 126, latest: null } });
}
const statusOf = (acceptance, id) => acceptance.checks.find((entry) => entry.id === id).status;

describe("HPP acceptance: evidence window and crossings", () => {
  it("is pending, not failed, when no crossing has happened during a full quiet window", () => {
    const now = new Date(ELIGIBLE.getTime() + 15 * DAY);
    const acceptance = acceptanceFor({ state: stateWith(), now });
    expect(statusOf(acceptance, "evidence_window")).toBe("pass");
    expect(statusOf(acceptance, "crossings_both_directions")).toBe("pending");
    expect(statusOf(acceptance, "transitions_paired")).toBe("pass");
    expect(acceptance.blocking).toEqual(["crossings_both_directions"]);
    // The pre-fix identity_mismatch hold ended before the window and is not counted against it.
    expect(acceptance.gaps[0]).toMatchObject({ preEvidence: true, needsExplanation: false });
  });

  it("does not start the window until the first eligible run", () => {
    const state = stateWith({ health: { firstEligibleAt: null, holdSince: FIRST_RUN.toISOString(), holdReason: "identity_mismatch", gaps: [] } });
    const acceptance = acceptanceFor({ state, now: ELIGIBLE });
    expect(acceptance.window).toMatchObject({ since: null, hours: 0, requiredHours: 48 });
    expect(statusOf(acceptance, "evidence_window")).toBe("pending");
    // An open review-class hold needs explaining even before the window starts.
    expect(statusOf(acceptance, "gaps_explained")).toBe("review");
  });

  it("passes with paired crossings in both directions after 48 hours of evidence", () => {
    const now = new Date(ELIGIBLE.getTime() + 2 * DAY + 60 * MINUTE);
    const transitions = [shadowTx(1, false, 2 * DAY, 2 * DAY + 10 * MINUTE), shadowTx(2, true, 5 * DAY, 5 * DAY + 25 * MINUTE)];
    // Legacy poll times lag the RDP observation by 37 and 52 minutes, but
    // trail the shadow's own evaluation by less than 30 minutes.
    const legacy = [
      { _id: "l1", timestamp: new Date(t(2 * DAY + 37 * MINUTE)), value: false },
      { _id: "l2", timestamp: new Date(t(5 * DAY + 52 * MINUTE)), value: true },
    ];
    const acceptance = acceptanceFor({ state: stateWith({ sequence: 2 }), transitions, legacy, now });
    expect(acceptance.pairing.pairs).toHaveLength(2);
    expect(acceptance.pairing.pairs[0]).toMatchObject({ observedDeltaMs: -37 * MINUTE, evaluatedDeltaMs: -27 * MINUTE });
    expect(acceptance.crossings).toEqual({ closed: 1, opened: 1, legacyClosed: 1, legacyOpened: 1 });
    expect(acceptance.blocking).toEqual([]);
    expect(acceptance.ready).toBe(true);
  });
});

it("passes the window at exactly 48 hours of eligible evaluation, not before", () => {
    expect(statusOf(acceptanceFor({ state: stateWith(), now: new Date(ELIGIBLE.getTime() + 2 * DAY - MINUTE) }), "evidence_window")).toBe("pending");
    expect(statusOf(acceptanceFor({ state: stateWith(), now: new Date(ELIGIBLE.getTime() + 2 * DAY) }), "evidence_window")).toBe("pass");
  });

describe("HPP acceptance: disagreements", () => {
  it("fails pairing when legacy saw a crossing the shadow did not, and the status disagrees", () => {
    const now = new Date(ELIGIBLE.getTime() + 3 * DAY);
    const legacy = [{ _id: "l1", timestamp: new Date(t(2 * DAY)), value: false }];
    const acceptance = acceptanceFor({ state: stateWith(), legacy, now });
    expect(acceptance.pairing.unpairedLegacy).toEqual([{ open: false, legacyAt: t(2 * DAY), legacyId: "l1" }]);
    expect(statusOf(acceptance, "transitions_paired")).toBe("fail");
    expect(statusOf(acceptance, "current_status_agrees")).toBe("fail");
  });

  it("treats a status disagreement within 30 minutes of a crossing as pending", () => {
    const transitions = [shadowTx(1, false, DAY, DAY + 2 * MINUTE)];
    const now = new Date(ELIGIBLE.getTime() + DAY + 10 * MINUTE);
    const acceptance = acceptanceFor({ state: stateWith({ sequence: 1 }), transitions, now });
    expect(statusOf(acceptance, "current_status_agrees")).toBe("pending");
  });

  it("reports both sides when a pair is outside tolerance on both clocks", () => {
    const shadow = [shadowTx(1, false, 0, 2 * MINUTE)];
    const legacy = [{ id: "l1", at: ELIGIBLE.getTime() + 90 * MINUTE, open: false }];
    expect(pairTransitions(legacy, shadow)).toMatchObject({ pairs: [], unpairedLegacy: [{ legacyId: "l1" }], unpairedShadow: [{ shadowId: shadow[0]._id }] });
  });

  it("flags holds longer than 2 hours or with a review-class reason inside the window", () => {
    const gaps = [
      { from: t(DAY), to: t(DAY + 30 * MINUTE), reason: "stale", runs: 2 },
      { from: t(2 * DAY), to: t(2 * DAY + 3 * 60 * MINUTE), reason: "source_unavailable", runs: 12 },
      { from: t(3 * DAY), to: t(3 * DAY + 15 * MINUTE), reason: "conflict", runs: 1 },
    ];
    const state = stateWith({ health: { gaps } });
    const acceptance = acceptanceFor({ state, now: new Date(ELIGIBLE.getTime() + 4 * DAY) });
    expect(acceptance.gaps.map((gap) => gap.needsExplanation)).toEqual([false, true, true]);
    expect(statusOf(acceptance, "gaps_explained")).toBe("review");
  });

  it("fails while an orphaned or conflicting sequence hold is unresolved", () => {
    const state = stateWith({ health: { holdSince: t(DAY), holdReason: "orphaned_transition", consecutiveHolds: 3,
      holdReasonCounts: { orphaned_transition: 3 } } });
    expect(statusOf(acceptanceFor({ state, now: new Date(ELIGIBLE.getTime() + 2 * DAY) }), "no_unresolved_review_holds")).toBe("fail");
  });

  it("flags missed cron runs below 95% of the 15-minute cadence", () => {
    const state = stateWith({ health: { runs: 80 } });
    expect(statusOf(acceptanceFor({ state, now: new Date(FIRST_RUN.getTime() + DAY) }), "run_cadence")).toBe("review");
  });
});

describe("HPP acceptance: legacy transitions and export", () => {
  it("collapses duplicate legacy rows and ignores older-shape rows", () => {
    const records = [
      seedRecord,
      { _id: "a", timestamp: new Date(t(DAY)), value: false },
      { _id: "dup", timestamp: new Date(t(DAY + MINUTE)), value: false },
      { _id: "old", readingDate: t(DAY), openIndicatorField: true },
      { _id: "b", timestamp: new Date(t(2 * DAY)), value: true },
    ];
    expect(legacyTransitionsAfter(records, Date.parse(SEED_AT)).map((record) => record.id)).toEqual(["a", "b"]);
  });

  it("exports checks, pairs and holds as CSV with escaped detail", () => {
    const acceptance = acceptanceFor({ state: stateWith(), now: new Date(ELIGIBLE.getTime() + DAY) });
    const csv = acceptanceToCsv(acceptance);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("kind,id,status_or_open,from_or_legacy_at,to_or_observed_at,evaluated_at,delta_minutes,detail");
    expect(lines.some((line) => line.startsWith("check,evidence_window,pending,"))).toBe(true);
    expect(lines.some((line) => line.startsWith("hold,identity_mismatch,pre_evidence,"))).toBe(true);
    expect(lines.find((line) => line.startsWith("check,closure_days_within_1"))).toMatch(/"7Days 0, 28Days 0/);
  });
});
