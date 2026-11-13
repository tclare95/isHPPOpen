/** @jest-environment node */
jest.mock("../libs/database", () => ({ connectToDatabase: jest.fn() }));

import { connectToDatabase } from "../libs/database";
import { applyHandover, AUTHORITATIVE_STATE_COLLECTION } from "../libs/hpp/hppAuthoritativeStore";
import { createHppAuthoritativeService } from "../libs/hpp/hppAuthoritativeService";
import { HPP_RULE_V1 } from "../libs/hpp/hppDecision";
import { planHandoverToApp, planHandoverToLegacy } from "../libs/hpp/hppHandover";
import { LEASE_MS } from "../libs/hpp/hppShadowRun";
import { createHppShadowService } from "../libs/hpp/hppShadowService";
import { LEGACY_COLLECTION, SHADOW_COLLECTIONS } from "../libs/hpp/hppShadowStore";
import { WRITER_CONTROL_COLLECTION, appWriterStatus, legacyMayWrite } from "../libs/hpp/hppWriterControl";
import { getHppStatusSnapshot } from "../libs/services/hppStatusService";
import { runHppShadowCron } from "../libs/services/hppShadowCronService";
import { createFakeDb } from "../testUtils/fakeMongo";
import { runLegacyWriter } from "../testUtils/legacyHppWriter";

const MINUTE = 60 * 1000;
const RULE = HPP_RULE_V1.ruleId;
const LEGACY_AT = "2026-03-15T19:52:22.347Z";
const T0 = new Date("2026-12-01T10:00:00.000Z");
const at = (minutes) => new Date(T0.getTime() + minutes * MINUTE);
const AUTHORITATIVE = { HPP_STATUS_SOURCE: "authoritative", VERCEL_ENV: "production" };
const SHADOW = { HPP_STATUS_SOURCE: "shadow", VERCEL_ENV: "production" };

// Real RDP rows: no per-row measurementId.
const row = (value, observedAt) => ({
  unit: "mASD", datum: "ASD", providerMeasureId: "4009-level-stage-i-15_min-mASD", sourceId: "ea-flood-monitoring",
  value, observedAt: observedAt.toISOString(),
});

function setup() {
  const fake = createFakeDb({ uniqueIndexes: {
    [SHADOW_COLLECTIONS.state]: [{ _id: 1 }], [SHADOW_COLLECTIONS.transitions]: [{ _id: 1 }],
    [AUTHORITATIVE_STATE_COLLECTION]: [{ _id: 1 }], [LEGACY_COLLECTION]: [{ _id: 1 }], [WRITER_CONTROL_COLLECTION]: [{ _id: 1 }],
  } });
  fake.docs(LEGACY_COLLECTION).push({ _id: "L0", timestamp: LEGACY_AT, value: true });
  connectToDatabase.mockResolvedValue({ db: fake.db });

  let evidence = { integrity: "verified", rows: [] };
  const getObservations = jest.fn(async () => {
    if (typeof evidence === "function") return evidence();
    if (evidence instanceof Error) throw evidence;
    return { meta: { measurementId: "ea-colwick-level", pageIntegrity: evidence.integrity }, data: evidence.rows };
  });
  const getClient = async () => ({ getObservations });
  const services = { shadow: createHppShadowService({ db: fake.db, getClient }), authoritative: createHppAuthoritativeService({ db: fake.db, getClient }) };
  const store = services.authoritative.store;

  const t = {
    fake, store, getObservations,
    level: (value, observedAt, integrity = "verified") => { evidence = { integrity, rows: [row(value, observedAt)] }; },
    setEvidence: (next) => { evidence = next; },
    cron: (now, env = AUTHORITATIVE, runId) => runHppShadowCron({ env, now, runId, create: async () => services }),
    legacy: (level, now) => runLegacyWriter(fake.db, { level, now }),
    openIndicator: () => fake.docs(LEGACY_COLLECTION),
    appRecords: () => fake.docs(LEGACY_COLLECTION).filter((record) => record.provenance === "hpp-status-service"),
    control: () => fake.docs(WRITER_CONTROL_COLLECTION)[0],
    state: () => fake.docs(AUTHORITATIVE_STATE_COLLECTION)[0],
    async planToApp(now, expectLatestId) {
      return planHandoverToApp({
        control: await store.loadControl(), latest: await store.latestOpenIndicator(), expectLatestId,
        shadowState: fake.docs(SHADOW_COLLECTIONS.state)[0], authoritativeState: await store.loadState(),
        maxAppSequence: await store.maxAppSequence(RULE), rule: HPP_RULE_V1, now,
      });
    },
    async toApp(now, expectLatestId) {
      const plan = await t.planToApp(now, expectLatestId);
      return plan.ok ? { ...plan, result: await applyHandover(fake.db, plan) } : plan;
    },
    async toLegacy(now) {
      const plan = planHandoverToLegacy({ control: await store.loadControl(), now });
      return plan.ok ? { ...plan, result: await applyHandover(fake.db, plan) } : plan;
    },
    /** Shadow fresh and agreeing, handed over, scraper acknowledged, fence passed. */
    async cutOver({ level = 1.0, expectId = "L0", from = 0 } = {}) {
      t.level(level, at(from - 5));
      expect(await t.cron(at(from), SHADOW)).toMatchObject({ ran: true, authoritative: false });
      expect((await t.toApp(at(from + 1), expectId)).result).toEqual({ applied: true });
      expect(await t.legacy(level, at(from + 3))).toEqual({ wrote: false, skipped: true });
      t.level(level, at(from + 3));
      return at(from + 7);
    },
  };
  return t;
}

describe("Authoritative mode is inactive until an explicit handover", () => {
  it("in authoritative mode without a control document, runs shadow only and never writes openIndicator", async () => {
    const t = setup();
    t.level(3.0, at(-5));
    const summary = await t.cron(T0);
    expect(summary).toMatchObject({ mode: "authoritative", writer: "legacy", authoritative: false, action: "transition", warning: null });
    expect(t.openIndicator()).toHaveLength(1);
    expect(t.fake.docs(SHADOW_COLLECTIONS.transitions)).toHaveLength(1);
    expect(t.state()).toBeUndefined();
  });

  it("never writes outside Production even in authoritative mode", async () => {
    const t = setup();
    expect(await t.cron(T0, { HPP_STATUS_SOURCE: "authoritative", VERCEL_ENV: "preview" })).toEqual({ mode: "authoritative", ran: false, reason: "non_production" });
  });

  it("warns that nobody is writing when the control names the app but the mode is shadow", async () => {
    const t = setup();
    await t.cutOver();
    t.level(3.0, at(6));
    const summary = await t.cron(at(7), SHADOW);
    expect(summary).toMatchObject({ authoritative: false, writer: "app", warning: "control_names_app_but_mode_is_not_authoritative" });
    expect(t.appRecords()).toHaveLength(0);
  });

  it("holds without writing until the scraper acknowledges, then until the fence passes", async () => {
    const t = setup();
    t.level(1.0, at(-5));
    await t.cron(T0, SHADOW);
    await t.toApp(at(1), "L0");
    t.level(3.0, at(1));
    expect(await t.cron(at(2))).toMatchObject({ authoritative: true, action: "hold", reason: "writer_awaiting_legacy_stop" });
    // An acknowledgement from a run that started before the switch does not count.
    await runLegacyWriter(t.fake.db, { level: 3.0, now: at(2), runStartedAt: at(0) });
    expect(await t.cron(at(3))).toMatchObject({ reason: "writer_awaiting_legacy_stop" });
    await t.legacy(3.0, at(4));
    expect(await t.cron(at(5))).toMatchObject({ reason: "writer_fence" });
    t.level(3.0, at(5));
    expect(await t.cron(at(7))).toMatchObject({ action: "transition", authoritative: true });
    expect(t.openIndicator()).toHaveLength(2);
  });

  it("refuses to start while the scraper reports it still wrote under the new epoch", () => {
    const control = { owner: "app", epoch: 2, switchedAt: at(0).toISOString(),
      legacyAck: { epoch: 2, observedOwner: "legacy", runStartedAt: at(1).toISOString(), wrote: true } };
    expect(appWriterStatus(control, at(10))).toEqual({ allowed: false, reason: "writer_legacy_still_writing" });
    expect(legacyMayWrite(null, T0)).toBe(true);
    expect(legacyMayWrite({ owner: "mystery" }, T0)).toBe(false);
  });
});

describe("Authoritative writer: threshold, evidence and openIndicator compatibility", () => {
  it("closes at exactly 2.2 m with an openIndicator-compatible record and reopens below it", async () => {
    const t = setup();
    const before = (await getHppStatusSnapshot({ now: T0 })).data;
    const start = await t.cutOver();
    expect(await t.cron(start)).toMatchObject({ authoritative: true, action: "none", reason: "unchanged" });
    expect(t.openIndicator()).toHaveLength(1);

    t.level(2.2, at(15));
    expect(await t.cron(at(22))).toMatchObject({ action: "transition", transitionId: `${RULE}#1` });
    expect(t.appRecords()).toEqual([{
      _id: `${RULE}#1`, timestamp: at(15).toISOString(), value: false, observedAt: at(15).toISOString(),
      evaluatedAt: at(22).toISOString(), level: 2.2, ruleId: RULE, source: "ea-colwick-level", sequence: 1, provenance: "hpp-status-service",
    }]);

    const closed = (await getHppStatusSnapshot({ now: at(30) })).data;
    expect(Object.keys(closed).sort()).toEqual(Object.keys(before).sort());
    expect(closed).toMatchObject({ isEmpty: false, currentStatus: false, lastChangedAt: at(15).toISOString() });

    t.level(2.19, at(45));
    expect(await t.cron(at(52))).toMatchObject({ action: "transition", transitionId: `${RULE}#2` });
    const reopened = (await getHppStatusSnapshot({ now: at(60) })).data;
    expect(reopened).toMatchObject({ currentStatus: true, lastChangedAt: at(15).toISOString(), closuresInLast7Days: 1 });
  });

  it.each([
    ["missing", { integrity: "verified", rows: [] }, "missing"],
    ["unverified", { integrity: "partial", rows: [row(3.0, at(5))] }, "unverified"],
    ["stale", { integrity: "verified", rows: [row(3.0, at(-30))] }, "stale"],
    ["source error", Object.assign(new Error("x"), { code: "TIMEOUT" }), "source_unavailable"],
  ])("holds the last-known status on %s evidence and writes nothing", async (_label, evidence, reason) => {
    const t = setup();
    const start = await t.cutOver();
    t.setEvidence(evidence);
    expect(await t.cron(start)).toMatchObject({ action: "hold", reason, state: { open: true, basisAt: LEGACY_AT } });
    expect(t.openIndicator()).toHaveLength(1);
  });

  it("does not synthesise a crossing across a stale period; the next fresh crossing is dated by its observation", async () => {
    const t = setup();
    const start = await t.cutOver();
    t.level(3.0, at(-40));
    expect(await t.cron(start)).toMatchObject({ action: "hold", reason: "stale" });
    t.level(1.0, at(20));
    expect(await t.cron(at(22))).toMatchObject({ action: "none", reason: "unchanged" });
    t.level(2.4, at(35));
    await t.cron(at(37));
    expect(t.appRecords().map((record) => [record._id, record.timestamp])).toEqual([[`${RULE}#1`, at(35).toISOString()]]);
  });
});

describe("Authoritative writer: duplicate, overlapping and interrupted runs", () => {
  it("lets only one of two overlapping runs write, and a repeated run is a no-op", async () => {
    const t = setup();
    const start = await t.cutOver();
    await t.cron(start);
    t.level(2.6, at(10));
    const results = await Promise.all([t.cron(at(12), AUTHORITATIVE, "a"), t.cron(at(12), AUTHORITATIVE, "b")]);
    expect(results.map((r) => r.action).sort()).toEqual(["skipped", "transition"]);
    expect(await t.cron(at(27))).toMatchObject({ action: "none", reason: "replay" });
    expect(t.appRecords()).toHaveLength(1);
  });

  it("adopts an openIndicator record written by a run whose state commit failed", async () => {
    const t = setup();
    const start = await t.cutOver();
    await t.cron(start);
    t.level(2.6, at(10));
    t.fake.failNext(AUTHORITATIVE_STATE_COLLECTION, "updateOne", { when: (_filter, update) => update.$set.lease === null });
    await expect(t.cron(at(12))).rejects.toThrow("simulated database failure");
    expect(t.appRecords()).toHaveLength(1);
    expect(t.state()).toMatchObject({ open: true, sequence: 0 });

    t.level(2.7, at(20));
    const retry = await t.cron(at(12 + LEASE_MS / MINUTE + 1));
    expect(retry).toMatchObject({ action: "none", reason: "unchanged", persisted: true });
    expect(t.appRecords()).toHaveLength(1);
    expect(t.state()).toMatchObject({ open: false, sequence: 1, changedAt: at(10).toISOString() });
  });

  it("treats an openIndicator insert whose acknowledgement was lost as already recorded", async () => {
    const t = setup();
    const start = await t.cutOver();
    await t.cron(start);
    t.level(2.6, at(10));
    t.fake.failNext(LEGACY_COLLECTION, "insertOne", { afterApply: true });
    await expect(t.cron(at(12))).rejects.toThrow();
    t.level(2.6, at(16));
    expect((await t.cron(at(12 + LEASE_MS / MINUTE + 1))).action).toBe("none");
    expect(t.appRecords()).toHaveLength(1);
  });

  it("writes nothing when ownership is withdrawn while a run is reading evidence", async () => {
    const t = setup();
    const start = await t.cutOver();
    await t.cron(start);
    t.setEvidence(async () => {
      await t.toLegacy(at(11));
      return { meta: { measurementId: "ea-colwick-level", pageIntegrity: "verified" }, data: [row(3.0, at(10))] };
    });
    expect(await t.cron(at(12))).toMatchObject({ authoritative: true, action: "hold", reason: "writer_not_owner" });
    expect(t.appRecords()).toHaveLength(0);
  });

  it("holds when another writer has written openIndicator, and when the state is from another epoch", async () => {
    const t = setup();
    const start = await t.cutOver();
    t.openIndicator().push({ _id: "rogue", timestamp: at(5).toISOString(), value: false });
    t.level(3.0, at(6));
    expect(await t.cron(start)).toMatchObject({ action: "hold", reason: "writer_foreign_write" });
    t.openIndicator().pop();
    t.state().epoch = 99;
    expect(await t.cron(at(22))).toMatchObject({ action: "hold", reason: "writer_epoch_mismatch" });
    expect(t.appRecords()).toHaveLength(0);
  });
});

describe("Handover reconciliation", () => {
  it.each([
    ["the latest record is not the one the operator named", (t) => t.level(1.0, at(-5)), "L-other", ["latest_record_unexpected"]],
    ["shadow disagrees with the latest record", (t) => t.level(3.0, at(-5)), "L0", ["shadow_disagrees_with_latest"]],
    ["shadow is holding", (t) => t.setEvidence({ integrity: "partial", rows: [row(1.0, at(-5))] }), "L0", ["shadow_not_fresh", "shadow_holding"]],
  ])("refuses when %s", async (_label, arrange, expectId, refusals) => {
    const t = setup();
    arrange(t);
    await t.cron(T0, SHADOW);
    expect(await t.toApp(at(1), expectId)).toEqual({ ok: false, refusals });
    expect(t.control()).toBeUndefined();
  });

  it("refuses when shadow has not evaluated recently", async () => {
    const t = setup();
    t.level(1.0, at(-5));
    await t.cron(T0, SHADOW);
    expect((await t.toApp(at(60), "L0")).refusals).toEqual(["shadow_not_fresh"]);
  });

  it("seeds authoritative state from the reconciled record, keeping its timestamp", async () => {
    const t = setup();
    await t.cutOver();
    expect(t.control()).toMatchObject({ owner: "app", epoch: 1, previousOwner: "legacy", reconciled: { id: "L0", timestamp: LEGACY_AT, value: true } });
    expect(t.state()).toMatchObject({ open: true, basisAt: LEGACY_AT, sequence: 0, epoch: 1, provenance: "legacy-openIndicator",
      seed: { legacyId: "L0", timestamp: LEGACY_AT, value: true, sequence: 0 } });
  });
});

describe("Rollback and repeated activation", () => {
  it("returns to the legacy writer without a gap in records or a duplicate, then re-activates with continuing ids", async () => {
    const t = setup();
    const start = await t.cutOver();
    t.level(2.5, at(10));
    expect(await t.cron(at(12))).toMatchObject({ transitionId: `${RULE}#1` });

    // Rollback.
    expect((await t.toLegacy(at(20))).result).toEqual({ applied: true });
    expect(t.control()).toMatchObject({ owner: "legacy", epoch: 2, previousOwner: "app" });
    t.level(2.5, at(20));
    expect(await t.cron(at(22))).toMatchObject({ authoritative: false, writer: "legacy" });
    expect(await t.legacy(1.0, at(23))).toMatchObject({ wrote: false, skipped: true }); // inside the app fence
    expect(await t.legacy(2.5, at(26))).toMatchObject({ wrote: false, skipped: false }); // app record is current
    expect(await t.legacy(1.0, at(41))).toMatchObject({ wrote: true });
    expect(t.openIndicator().map((record) => [String(record._id), record.value])).toEqual([
      ["L0", true], [`${RULE}#1`, false], [`legacy-${at(41).toISOString()}`, true],
    ]);
    expect((await getHppStatusSnapshot({ now: at(45) })).data).toMatchObject({ currentStatus: true, lastChangedAt: at(10).toISOString() });
    expect(await t.toLegacy(at(46))).toEqual({ ok: false, refusals: ["not_app"] });

    // Repeated activation from the scraper's latest record.
    const latestId = `legacy-${at(41).toISOString()}`;
    const again = await t.cutOver({ expectId: latestId, from: 50 });
    expect(t.control()).toMatchObject({ owner: "app", epoch: 3 });
    expect(t.state()).toMatchObject({ sequence: 1, epoch: 3, seed: { legacyId: latestId, sequence: 1 } });
    expect(await t.toApp(at(58), latestId)).toEqual({ ok: false, refusals: ["already_app"] });

    expect(await t.cron(again)).toMatchObject({ authoritative: true, action: "none" });
    t.level(2.3, at(70));
    expect(await t.cron(at(72))).toMatchObject({ transitionId: `${RULE}#2` });
    expect(t.appRecords().map((record) => record._id)).toEqual([`${RULE}#1`, `${RULE}#2`]);
  });

  it("rejects a handover planned against a control epoch that has since changed", async () => {
    const t = setup();
    await t.cutOver();
    const stale = planHandoverToLegacy({ control: await t.store.loadControl(), now: at(10) });
    expect((await t.toLegacy(at(11))).result).toEqual({ applied: true });
    expect(await applyHandover(t.fake.db, stale)).toEqual({ applied: false, conflict: "control_epoch_changed" });
    expect(t.control()).toMatchObject({ owner: "legacy", epoch: 2 });
  });
});
