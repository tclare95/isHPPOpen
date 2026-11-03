/** @jest-environment node */
import { HPP_RULE_V1 } from "../libs/hpp/hppDecision";
import { buildShadowReport, projectServiceHistory, compareWithLegacy, seedStateFromLegacy } from "../libs/hpp/hppHistory";
import { LEASE_MS, runHppShadowEvaluation } from "../libs/hpp/hppShadowRun";
import { calculateHppStatus } from "../libs/services/hppStatusService";
import { createMongoShadowStore, LEGACY_COLLECTION, SHADOW_COLLECTIONS } from "../services/hpp-status/mongoShadowStore";
import { createRdpColwickReader } from "../services/hpp-status/rdpColwickReader";
import { createHppShadowService } from "../services/hpp-status";
import { createFakeDb } from "../testUtils/fakeMongo";

const MINUTE = 60 * 1000;
const API_URL = "https://abc123.execute-api.eu-west-1.amazonaws.com/production";
const LEGACY_AT = "2026-03-15T09:07:31.000Z";
const NOW = new Date("2026-11-03T12:00:00.000Z");
const at = (minutes) => new Date(NOW.getTime() + minutes * MINUTE);

const row = (value, observedAt, overrides = {}) => ({
  measurementId: "ea-colwick-level",
  unit: "mASD",
  datum: "ASD",
  providerMeasureId: "4009-level-stage-i-15_min-mASD",
  sourceId: "ea-flood-monitoring",
  value,
  observedAt: observedAt instanceof Date ? observedAt.toISOString() : observedAt,
  ...overrides,
});
const page = (...rows) => ({ pageIntegrity: "verified", rows });

function setup({ legacy = [{ _id: "legacy-1", timestamp: LEGACY_AT, value: true }] } = {}) {
  const fake = createFakeDb({
    uniqueIndexes: { [SHADOW_COLLECTIONS.state]: [{ _id: 1 }], [SHADOW_COLLECTIONS.transitions]: [{ _id: 1 }] },
  });
  fake.docs(LEGACY_COLLECTION).push(...legacy);
  const store = createMongoShadowStore(fake.db);
  let evidence = page();
  const readEvidence = jest.fn(async () => {
    if (evidence instanceof Error) throw evidence;
    return evidence;
  });
  const run = (now = NOW, runId) => runHppShadowEvaluation({ store, readEvidence, now, runId });
  return {
    fake, store, readEvidence, run,
    setEvidence: (next) => { evidence = next; },
    state: () => fake.docs(SHADOW_COLLECTIONS.state)[0],
    transitions: () => fake.docs(SHADOW_COLLECTIONS.transitions),
  };
}

const legacyWrites = (fake) => fake.calls.filter((call) => call.collection === LEGACY_COLLECTION && !["find", "findOne"].includes(call.op));

describe("HPP shadow evaluation: threshold and state", () => {
  it("seeds from the latest valid legacy record, ignoring older-shape rows, and keeps its timestamp", async () => {
    const t = setup({ legacy: [
      { _id: "old-shape", readingDate: "2024-03-17T00:00:00.000Z", openIndicatorField: false },
      { _id: "legacy-0", timestamp: "2026-02-01T10:00:00.000Z", value: false },
      { _id: "legacy-1", timestamp: LEGACY_AT, value: true },
    ] });
    t.setEvidence(page(row(1.5, at(-10))));
    const result = await t.run();
    expect(result).toMatchObject({ action: "none", reason: "unchanged", persisted: true });
    expect(t.state().seed).toEqual({ legacyId: "legacy-1", timestamp: LEGACY_AT, value: true });
    expect(t.state()).toMatchObject({ open: true, changedAt: LEGACY_AT, provenance: "legacy-openIndicator", sequence: 0 });
    expect(t.transitions()).toHaveLength(0);
  });

  it("closes at exactly 2.2 m, stamped with observation time, and reopens below it", async () => {
    const t = setup();
    t.setEvidence(page(row(2.2, at(-12))));
    const closed = await t.run();
    expect(closed).toMatchObject({ action: "transition", transitionId: "hpp-colwick-level-2.2m-v1#1", persisted: true });
    expect(t.transitions()[0]).toMatchObject({
      sequence: 1, open: false, level: 2.2, observedAt: at(-12).toISOString(), evaluatedAt: NOW.toISOString(),
      ruleId: HPP_RULE_V1.ruleId, authoritative: false, previous: { open: true, basisAt: LEGACY_AT },
    });
    expect(t.state()).toMatchObject({ open: false, changedAt: at(-12).toISOString(), sequence: 1 });

    t.setEvidence(page(row(2.19, at(3))));
    expect(await t.run(at(15))).toMatchObject({ action: "transition", transitionId: "hpp-colwick-level-2.2m-v1#2" });
    expect(t.state()).toMatchObject({ open: true, sequence: 2 });
  });

  it("never writes legacy openIndicator", async () => {
    const t = setup();
    t.setEvidence(page(row(3, at(-5))));
    await t.run();
    expect(legacyWrites(t.fake)).toEqual([]);
    expect(t.fake.docs(LEGACY_COLLECTION)).toEqual([{ _id: "legacy-1", timestamp: LEGACY_AT, value: true }]);
  });

  it("holds without persisting when no legacy record can establish state", async () => {
    const t = setup({ legacy: [{ readingDate: "2024-03-14T00:00:00.000Z", openIndicatorField: true }] });
    t.setEvidence(page(row(3, at(-5))));
    expect(await t.run()).toEqual({ action: "hold", reason: "no_established_state", persisted: false });
    expect(t.fake.docs(SHADOW_COLLECTIONS.state)).toHaveLength(0);
    expect(t.readEvidence).not.toHaveBeenCalled();
  });
});

describe("HPP shadow evaluation: last-known state on unusable evidence", () => {
  const cases = [
    ["missing", page(), "missing"],
    ["unverified", { pageIntegrity: "partial", rows: [row(3, at(-5))] }, "unverified"],
    ["stale", page(row(3, at(-31))), "stale"],
    ["wrong datum", page(row(3, at(-5), { datum: "mAOD" })), "identity_mismatch"],
    ["wrong unit", page(row(3, at(-5), { unit: "m" })), "identity_mismatch"],
    ["other source", page(row(3, at(-5), { sourceId: "other" })), "identity_mismatch"],
    ["conflict", page(row(3, at(-5)), row(1, at(-5))), "conflict"],
    ["source error", Object.assign(new Error("x"), { code: "AUTHORIZATION_FAILED" }), "source_unavailable"],
  ];

  it.each(cases)("%s: holds with the last-known state and records the hold", async (_label, evidence, reason) => {
    const t = setup();
    t.setEvidence(evidence);
    const result = await t.run();
    expect(result).toMatchObject({ action: "hold", reason, persisted: true, state: { open: true, basisAt: LEGACY_AT } });
    expect(t.transitions()).toHaveLength(0);
    expect(t.state().health).toMatchObject({ holdSince: NOW.toISOString(), holdReason: reason, consecutiveHolds: 1 });
  });

  it("records the hold interval as a continuity gap when eligible evidence resumes, without back-filling crossings", async () => {
    const t = setup();
    t.setEvidence(Object.assign(new Error("x"), { code: "TIMEOUT" }));
    await t.run(at(0));
    await t.run(at(15));
    expect(t.state().health).toMatchObject({ consecutiveHolds: 2, lastSourceError: "TIMEOUT" });

    t.setEvidence(page(row(2.5, at(28))));
    expect(await t.run(at(30))).toMatchObject({ action: "transition" });
    expect(t.transitions()).toHaveLength(1);
    expect(t.state().health).toMatchObject({
      holdSince: null, consecutiveHolds: 0, lastObservationAgeMs: 2 * MINUTE, lastLevel: 2.5,
      gaps: [{ from: at(0).toISOString(), to: at(30).toISOString(), reason: "source_unavailable", runs: 2 }],
    });
  });

  it("does not treat a replayed or older observation as a change", async () => {
    const t = setup();
    t.setEvidence(page(row(2.5, at(-5))));
    await t.run();
    expect(await t.run(at(5))).toMatchObject({ action: "none", reason: "replay" });
    t.setEvidence(page(row(1.0, at(-20))));
    expect(await t.run(at(6))).toMatchObject({ action: "none", reason: "superseded" });
    expect(t.transitions()).toHaveLength(1);
  });
});

describe("HPP shadow evaluation: single writer and retry safety", () => {
  it("adopts a transition recorded by a run whose state commit failed, so a retry adds no duplicate", async () => {
    const t = setup();
    t.setEvidence(page(row(2.6, at(-5))));
    t.fake.failNext(SHADOW_COLLECTIONS.state, "updateOne", { when: (filter) => filter.revision === 1 });
    await expect(t.run()).rejects.toThrow("simulated database failure");
    expect(t.transitions()).toHaveLength(1);
    expect(t.state()).toMatchObject({ open: true, sequence: 0 });

    // Retry after the lease expires, with a newer reading in the same state.
    t.setEvidence(page(row(2.7, at(LEASE_MS / MINUTE + 1))));
    const retry = await t.run(at(LEASE_MS / MINUTE + 2));
    expect(retry).toMatchObject({ action: "none", reason: "unchanged", persisted: true });
    expect(t.transitions()).toHaveLength(1);
    expect(t.state()).toMatchObject({ open: false, sequence: 1, changedAt: at(-5).toISOString() });
  });

  it("treats a transition insert whose acknowledgement was lost as already recorded", async () => {
    const t = setup();
    t.setEvidence(page(row(2.6, at(-5))));
    t.fake.failNext(SHADOW_COLLECTIONS.transitions, "insertOne", { afterApply: true });
    await expect(t.run()).rejects.toThrow();
    const retry = await t.run(at(LEASE_MS / MINUTE + 1));
    expect(retry.action).toBe("none");
    expect(t.transitions()).toHaveLength(1);
    expect(t.state()).toMatchObject({ open: false, sequence: 1 });
  });

  it("lets only one of two overlapping runs write", async () => {
    const t = setup();
    t.setEvidence(page(row(2.6, at(-5))));
    await t.run(at(-60)); // seed outside the race
    const results = await Promise.all([t.run(NOW, "a"), t.run(NOW, "b")]);
    expect(results.map((r) => r.action).sort()).toEqual(["skipped", "transition"]);
    expect(t.transitions()).toHaveLength(1);
  });

  it("skips while another run holds an unexpired lease and proceeds once it has expired", async () => {
    const t = setup();
    t.setEvidence(page(row(1.0, at(-5))));
    await t.run(at(-60));
    t.state().lease = { runId: "stuck", until: at(1).toISOString() };
    expect(await t.run()).toMatchObject({ action: "skipped", reason: "lease_held" });
    expect((await t.run(at(2))).action).toBe("none");
    expect(t.state().lease).toBeNull();
  });

  it("holds an orphaned transition for review instead of adopting it behind the basis", async () => {
    const t = setup();
    t.setEvidence(page(row(1.0, at(-5))));
    await t.run();
    t.transitions().push({ _id: `${HPP_RULE_V1.ruleId}#1`, sequence: 1, ruleId: HPP_RULE_V1.ruleId, open: false, observedAt: at(-10).toISOString() });
    expect(await t.run(at(10))).toMatchObject({ action: "hold", reason: "orphaned_transition", state: { open: true, sequence: 0 } });
  });

  it("holds when the stored state belongs to another rule", async () => {
    const t = setup();
    t.setEvidence(page(row(1.0, at(-5))));
    await t.run();
    t.state().ruleId = "hpp-colwick-level-2.4m-v2";
    expect(await t.run(at(5))).toMatchObject({ action: "hold", reason: "rule_mismatch" });
    expect(t.readEvidence).toHaveBeenCalledTimes(1);
  });
});

describe("HPP history projection, carry-in and legacy comparison", () => {
  const legacyHistory = [
    { timestamp: new Date("2025-10-01T00:00:00.000Z"), value: false }, // carried in, closed
    { timestamp: new Date("2026-01-10T00:00:00.000Z"), value: true },
    { timestamp: new Date("2026-02-20T00:00:00.000Z"), value: false },
    { timestamp: new Date(LEGACY_AT), value: true }, // seed
  ];
  const seed = { timestamp: LEGACY_AT, value: true };

  it("keeps legacy timestamps verbatim up to the seed and dates service transitions by observation", () => {
    const transitions = [
      { _id: "r#2", sequence: 2, ruleId: "r", open: true, observedAt: "2026-10-30T08:00:00.000Z" },
      { _id: "r#1", sequence: 1, ruleId: "r", open: false, observedAt: "2026-10-28T06:45:00.000Z" },
    ];
    const laterLegacy = { timestamp: new Date("2026-10-28T07:00:00.000Z"), value: false };
    const records = projectServiceHistory({ legacyRecords: [...legacyHistory, laterLegacy], seed, transitions });
    expect(records.map((r) => [r.timestamp, r.value])).toEqual([
      ["2025-10-01T00:00:00.000Z", false],
      ["2026-01-10T00:00:00.000Z", true],
      ["2026-02-20T00:00:00.000Z", false],
      [LEGACY_AT, true],
      ["2026-10-28T06:45:00.000Z", false],
      ["2026-10-30T08:00:00.000Z", true],
    ]);
  });

  it("reproduces the public 7/28/182/365-day calculation including carried-in closure", () => {
    const records = projectServiceHistory({ legacyRecords: legacyHistory, seed, transitions: [] });
    const status = calculateHppStatus(records, NOW);
    expect(status).toEqual(calculateHppStatus(legacyHistory, NOW));
    // Closed carried in from before the 365-day start (2025-11-03): 68 days to
    // 10 Jan, plus 20 Feb 00:00 → 15 Mar 09:07 (23.4, rounded up per closure to 24).
    // Nothing falls in the 182-day window.
    expect(status).toMatchObject({ currentStatus: true, closuresInLast365Days: 92, closuresInLast182Days: 0 });
  });

  it("matches legacy within tolerance and reports real differences", () => {
    const service = [...legacyHistory, { timestamp: "2026-10-28T06:45:00.000Z", value: false }];
    const legacy = [...legacyHistory, { timestamp: new Date("2026-10-28T07:00:00.000Z"), value: false }];
    const same = compareWithLegacy({ serviceRecords: service, legacyRecords: legacy, now: NOW });
    expect(same).toMatchObject({ comparable: true, matches: true, lastChangedDeltaMs: -15 * MINUTE });

    const differs = compareWithLegacy({ serviceRecords: service, legacyRecords: legacyHistory, now: NOW });
    expect(differs.matches).toBe(false);
    expect(differs.differences.map((d) => d.field)).toEqual(expect.arrayContaining(["currentStatus", "lastChangedAt"]));
  });

  it("seeds only from a record with a valid timestamp and boolean value", () => {
    expect(seedStateFromLegacy({ timestamp: "bad", value: true }, HPP_RULE_V1)).toBeNull();
    expect(seedStateFromLegacy({ timestamp: LEGACY_AT, value: "true" }, HPP_RULE_V1)).toBeNull();
  });
});

describe("HPP shadow report", () => {
  it("reports unseeded, ok, holding and overdue states with contiguous continuity", async () => {
    const t = setup();
    expect(buildShadowReport({ state: null, now: NOW })).toMatchObject({ status: "unseeded", authoritative: false });

    t.setEvidence(page(row(2.6, at(-5))));
    await t.run();
    const transitions = await t.store.listTransitions(HPP_RULE_V1.ruleId);
    const legacyRecords = await t.store.readLegacyHistory(NOW);
    const ok = buildShadowReport({ state: t.state(), transitions, legacyRecords, now: at(1) });
    expect(ok).toMatchObject({
      status: "ok", lastKnown: { open: false, sequence: 1 },
      continuity: { transitions: 1, sequences: [1], contiguous: true },
      comparison: { comparable: true, matches: false },
    });
    expect(buildShadowReport({ state: t.state(), now: at(60) }).status).toBe("run_overdue");

    t.setEvidence(page());
    await t.run(at(15));
    expect(buildShadowReport({ state: t.state(), transitions, now: at(16) }).status).toBe("holding");
  });

  it("composes store, reader and report without touching openIndicator", async () => {
    const t = setup();
    const signedGet = jest.fn(async () => ({ status: 200, body: { meta: { measurementId: "ea-colwick-level", pageIntegrity: "verified" }, data: [row(1.2, at(-4))] } }));
    const service = createHppShadowService({ db: t.fake.db, apiUrl: API_URL, signedGet });
    expect(await service.runOnce({ now: NOW })).toMatchObject({ action: "none", persisted: true });
    const report = await service.report({ now: at(1) });
    expect(report).toMatchObject({ status: "ok", comparison: { comparable: true, matches: true } });
    expect(legacyWrites(t.fake)).toEqual([]);
  });
});

describe("RDP Colwick reader", () => {
  const ok = (data, meta = {}) => ({ status: 200, body: { meta: { measurementId: "ea-colwick-level", pageIntegrity: "verified", ...meta }, data } });

  it("requests a bounded observations window for the rule's measurement", async () => {
    const signedGet = jest.fn(async () => ok([row(1, at(-5))]));
    const read = createRdpColwickReader({ apiUrl: API_URL, signedGet });
    expect(await read(NOW)).toEqual({ pageIntegrity: "verified", rows: [row(1, at(-5))] });
    const url = new URL(signedGet.mock.calls[0][0]);
    expect(url.pathname).toBe("/production/v1/measurements/ea-colwick-level/observations");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: at(-120).toISOString(), to: NOW.toISOString(), limit: "65" });
  });

  it("passes page integrity through for assessment rather than deciding itself", async () => {
    const read = createRdpColwickReader({ apiUrl: API_URL, signedGet: async () => ok([], { pageIntegrity: "partial" }) });
    expect(await read(NOW)).toEqual({ pageIntegrity: "partial", rows: [] });
  });

  it.each([
    [{ status: 403 }, "AUTHORIZATION_FAILED"],
    [{ status: 429 }, "THROTTLED"],
    [{ status: 503 }, "UPSTREAM_ERROR"],
    [{ status: 200, body: { meta: { measurementId: "ea-shardlow-level" }, data: [] } }, "RESPONSE_CONTRACT_ERROR"],
    [{ status: 200, body: { error: {} } }, "RESPONSE_CONTRACT_ERROR"],
    [ok([], { nextCursor: "abc" }), "CATCHUP_BUDGET_EXCEEDED"],
  ])("maps %j to %s", async (response, code) => {
    const read = createRdpColwickReader({ apiUrl: API_URL, signedGet: async () => response });
    await expect(read(NOW)).rejects.toMatchObject({ code });
  });

  it("maps transport failures to fixed codes", async () => {
    const read = createRdpColwickReader({ apiUrl: API_URL, signedGet: async () => { throw Object.assign(new Error("secret detail"), { code: "TIMEOUT" }); } });
    await expect(read(NOW)).rejects.toMatchObject({ code: "TIMEOUT", message: "RDP Colwick read TIMEOUT" });
  });

  it.each([
    "https://abc.execute-api.eu-west-2.amazonaws.com/production",
    "https://abc.execute-api.eu-west-1.amazonaws.com/production/extra",
    "http://abc.execute-api.eu-west-1.amazonaws.com/staging",
  ])("rejects configuration %s", (apiUrl) => {
    expect(() => createRdpColwickReader({ apiUrl, signedGet: async () => ok([]) })).toThrow(expect.objectContaining({ code: "CONFIGURATION_ERROR" }));
  });
});
