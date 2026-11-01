/** @jest-environment node */
// Deterministic reliability tests for scheduled alert evaluation (#47): overlapping runs,
// retries, partial commits, provider timeouts, uncertain sends, recovery and run records.
// All database, source and email interactions are in-memory doubles; nothing is sent.
import { createFakeDb } from "../testUtils/fakeMongo";

jest.mock("../libs/database");
jest.mock("../libs/services/alertMailerService", () => ({
  ...jest.requireActual("../libs/services/alertMailerService"),
  sendAlertConfirmationEmail: jest.fn(),
  sendManageAlertsAccessEmail: jest.fn(),
  sendThresholdAlertEmail: jest.fn(),
}));
jest.mock("../libs/services/trentWeirsService", () => ({ getLegacyTrentWeirsSnapshot: jest.fn() }));
jest.mock("../libs/services/forecastService", () => ({ getLatestForecastSnapshot: jest.fn() }));
jest.mock("../libs/services/hppStatusService", () => ({ getHppStatusSnapshot: jest.fn() }));
jest.mock("../libs/services/waterQualityService", () => ({ getLatestWaterQualitySnapshot: jest.fn(), getWaterQualityDensitySeries: jest.fn() }));
jest.mock("../libs/waterQualityIndicator", () => ({ getCsoActivityAssessment: jest.fn() }));

const { connectToDatabase } = require("../libs/database");
const { sendThresholdAlertEmail, AlertEmailError } = require("../libs/services/alertMailerService");
const { getLegacyTrentWeirsSnapshot } = require("../libs/services/trentWeirsService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const { getHppStatusSnapshot } = require("../libs/services/hppStatusService");
const { getLatestWaterQualitySnapshot, getWaterQualityDensitySeries } = require("../libs/services/waterQualityService");
const { getCsoActivityAssessment } = require("../libs/waterQualityIndicator");
const { runColwickAlerts } = require("../libs/services/colwickAlertsService");

const T0 = new Date("2026-11-01T12:00:00.000Z");
const minutes = (count) => new Date(T0.getTime() + count * 60 * 1000);
const hours = (count) => minutes(count * 60);
const GAUGE_KEY = "user@example.com|gauge|4009-level|live|above|1.5";
const DELIVERY_INDEX = { alertDeliveries: [{ alertKey: 1, transitionId: 1 }] };

const trentAt = (value, at) => ({ fallback: false, partial: false, stations: [{ stationId: 4009, measures: { level: { latestValue: value, readings: [{ dateTime: at.toISOString(), value }] } } }] });
const gaugeRule = (overrides = {}) => ({ alertKey: GAUGE_KEY, email: "user@example.com", alertType: "gauge", gaugeKey: "4009-level", gaugeName: "Colwick", stationId: 4009, measureType: "level", source: "live", direction: "above", threshold: 1.5, status: "active", lastConditionState: "armed", unsubscribeToken: "unsubscribe-token", confirmedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z", ...overrides });
const uncertain = (reason = "timeout") => new AlertEmailError(502, "Alert email provider did not respond", "uncertain", reason);
const rejected = (status = 422) => new AlertEmailError(502, "Invalid recipient", "rejected", `http_${status}`);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function waitFor(predicate) {
  for (let i = 0; i < 200 && !predicate(); i += 1) await new Promise((done) => setImmediate(done));
  if (!predicate()) throw new Error("condition not reached");
}

let fake;
const run = (now) => runColwickAlerts({ now });
const subscription = (key = GAUGE_KEY) => fake.docs("alertSubscriptions").find((doc) => doc.alertKey === key);
const deliveries = () => fake.docs("alertDeliveries");
const runs = () => fake.docs("alertRuns");
const sentKeys = () => sendThresholdAlertEmail.mock.calls.map(([args]) => args.idempotencyKey);
const seed = (...rules) => fake.docs("alertSubscriptions").push(...rules.map((rule) => structuredClone(rule)));

beforeEach(() => {
  jest.clearAllMocks();
  fake = createFakeDb({ uniqueIndexes: DELIVERY_INDEX });
  connectToDatabase.mockResolvedValue({ db: fake.db });
  getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.72, T0));
  getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });
  getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: false, health: { generatedAt: T0.toISOString() } } });
  getLatestWaterQualitySnapshot.mockResolvedValue({ ScrapeTimestamp: T0.toISOString() });
  getWaterQualityDensitySeries.mockResolvedValue([]);
  getCsoActivityAssessment.mockReturnValue({ level: "lower" });
  sendThresholdAlertEmail.mockResolvedValue(undefined);
});

describe("overlapping and concurrent invocations", () => {
  test("simultaneous runs on the same crossing send exactly one notification", async () => {
    seed(gaugeRule());

    const [first, second] = await Promise.all([run(minutes(1)), run(minutes(1))]);

    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(first.sent + second.sent).toBe(1);
    expect(first.suppressed + second.suppressed).toBe(1);
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ state: "sent", attempts: 1 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", stateRevision: 1, lastTriggeredAt: minutes(1).toISOString() });
    expect(subscription().pendingTransitionId).toBeUndefined();
  });

  test("a run overlapping an in-flight send leaves it alone and does not resend", async () => {
    seed(gaugeRule());
    const providerCall = deferred();
    sendThresholdAlertEmail.mockImplementationOnce(() => providerCall.promise);

    const slow = run(minutes(1));
    await waitFor(() => sendThresholdAlertEmail.mock.calls.length === 1);
    const overlapping = await run(minutes(3));
    providerCall.resolve();
    const slowResult = await slow;

    expect(overlapping).toMatchObject({ sent: 0, inFlight: 1 });
    expect(slowResult.sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });

  test("a stale run cannot overwrite a newer transition written by another run", async () => {
    seed(gaugeRule({ lastConditionState: "triggered", stateRevision: 3 }));
    const snapshot = deferred();
    getLegacyTrentWeirsSnapshot.mockImplementationOnce(() => snapshot.promise);

    const stale = run(minutes(1));
    await waitFor(() => getLegacyTrentWeirsSnapshot.mock.calls.length === 1);
    // Meanwhile other invocations re-armed and re-triggered the rule for a new crossing.
    Object.assign(subscription(), { lastConditionState: "triggered", stateRevision: 5, lastTransitionId: "newer" });
    snapshot.resolve(trentAt(1.2, T0)); // the stale run saw an old "cleared" reading
    const result = await stale;

    expect(result).toMatchObject({ rearmed: 0, suppressed: 1 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", stateRevision: 5 });

    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.75, minutes(15)));
    await run(minutes(16));
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });

  test("a rule unsubscribed during evaluation is not notified", async () => {
    seed(gaugeRule());
    const snapshot = deferred();
    getLegacyTrentWeirsSnapshot.mockImplementationOnce(() => snapshot.promise);

    const pending = run(minutes(1));
    await waitFor(() => getLegacyTrentWeirsSnapshot.mock.calls.length === 1);
    Object.assign(subscription(), { status: "unsubscribed" });
    snapshot.resolve(trentAt(1.8, T0));
    const result = await pending;

    expect(result).toMatchObject({ sent: 0, suppressed: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(deliveries()).toHaveLength(0);
    expect(subscription()).toMatchObject({ status: "unsubscribed", lastConditionState: "armed" });
  });

  test("concurrent recovery of an uncertain delivery makes a single provider attempt", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(minutes(1));

    const [first, second] = await Promise.all([run(minutes(16)), run(minutes(16))]);

    expect(first.sent + second.sent).toBe(1);
    expect(first.inFlight + second.inFlight).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
    expect(new Set(sentKeys()).size).toBe(1);
    expect(deliveries()[0]).toMatchObject({ state: "sent", attempts: 2 });
  });
});

describe("provider outcomes", () => {
  test("a definite rejection records failure and re-arms, so a later reading can notify", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(rejected(422));

    const first = await run(minutes(1));
    expect(first).toMatchObject({ sent: 0, failed: 1, skipped: 1 });
    expect(deliveries()[0]).toMatchObject({ state: "failed", lastError: "http_422" });
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });
    expect(subscription().pendingTransitionId).toBeUndefined();
    expect(runs()[0].status).toBe("degraded");

    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.74, minutes(15)));
    const second = await run(minutes(16));
    expect(second.sent).toBe(1);
    expect(deliveries().map((doc) => doc.state)).toEqual(["failed", "sent"]);
  });

  test("a provider timeout is held as uncertain and retried with the same idempotency key and payload", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain("timeout"));

    const first = await run(minutes(1));
    expect(first).toMatchObject({ sent: 0, uncertain: 1 });
    expect(deliveries()[0]).toMatchObject({ state: "uncertain", attempts: 1, lastError: "timeout" });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", pendingTransitionId: deliveries()[0].transitionId });

    // A newer reading must not create a second, uncorrelated delivery.
    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.8, minutes(15)));
    const second = await run(minutes(16));

    expect(second.sent).toBe(1);
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ state: "sent", attempts: 2 });
    const [firstCall, retryCall] = sendThresholdAlertEmail.mock.calls.map(([args]) => args);
    expect(retryCall).toEqual(firstCall);
    expect(retryCall.observedValue).toBe(1.72);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastTriggeredAt: minutes(16).toISOString() });
    expect(subscription().pendingTransitionId).toBeUndefined();
  });

  test("uncertain sends are held for review once provider idempotency protection would expire", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(minutes(1));

    const held = await run(new Date(minutes(1).getTime() + 23 * 60 * 60 * 1000));

    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(held).toMatchObject({ sent: 0, heldForReview: 1, needsReview: true });
    expect(held.outstandingDeliveries).toMatchObject({ heldForReview: 1 });
    expect(deliveries()[0]).toMatchObject({ state: "held_for_review", heldReason: "idempotency_window_expired" });
    expect(runs()[1].status).toBe("degraded");

    await run(hours(30));
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });

  test("operator reconciliation: confirmed sent completes the transition without sending", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(minutes(1));
    await run(hours(24));
    deliveries()[0].state = "sent";

    const result = await run(hours(25));

    expect(result).toMatchObject({ sent: 0, suppressed: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
    expect(subscription().pendingTransitionId).toBeUndefined();
  });

  test("operator reconciliation: confirmed not sent releases the rule for normal evaluation", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(minutes(1));
    await run(hours(24));
    deliveries()[0].state = "abandoned";

    const released = await run(hours(25));
    expect(released.released).toBe(1);
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });

    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.7, hours(25)));
    const next = await run(hours(25.25));
    expect(next.sent).toBe(1);
    expect(deliveries()).toHaveLength(2);
    expect(new Set(sentKeys()).size).toBe(2);
  });

  test("repeated uncertain attempts stop after the attempt limit", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValue(uncertain("http_503"));

    for (let attempt = 0; attempt < 6; attempt += 1) await run(minutes(1 + attempt * 15));

    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(5);
    expect(new Set(sentKeys()).size).toBe(1);
    expect(deliveries()[0]).toMatchObject({ state: "held_for_review", heldReason: "max_attempts", attempts: 5 });
  });

  test("a repeated definite rejection of the same transition re-arms again rather than holding", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValue(rejected(422));
    await run(minutes(1));

    const repeat = await run(minutes(16)); // same reading time, so the same transition and record

    expect(repeat).toMatchObject({ failed: 1, heldForReview: 0 });
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ state: "failed", attempts: 2 });
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });
  });

  test("a rejection after an earlier uncertain attempt is held rather than re-armed", async () => {
    seed(gaugeRule());
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain()).mockRejectedValueOnce(rejected(422));
    await run(minutes(1));

    const result = await run(minutes(16));

    expect(result.heldForReview).toBe(1);
    expect(deliveries()[0]).toMatchObject({ state: "held_for_review", heldReason: "rejected_after_uncertain" });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });
});

describe("partial database failure and recovery", () => {
  test("send accepted but recording it fails: the claim is recovered with the same key after it goes stale", async () => {
    seed(gaugeRule());
    fake.failNext("alertDeliveries", "updateOne", { when: (filter, update) => update.$set?.state === "sent" });

    const first = await run(minutes(1));
    expect(first).toMatchObject({ errors: 1, sent: 0 });
    expect(first.errorCategories).toEqual({ MongoNetworkError: 1 });
    expect(deliveries()[0]).toMatchObject({ state: "claimed", attempts: 1 });

    const overlapping = await run(minutes(5));
    expect(overlapping.inFlight).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);

    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.9, minutes(15)));
    const recovered = await run(minutes(16));
    expect(recovered.sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
    expect(new Set(sentKeys()).size).toBe(1); // provider de-duplicates within its idempotency window
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ state: "sent", attempts: 2 });
  });

  test("gate committed but delivery intent not written: nothing is sent and the rule is released", async () => {
    seed(gaugeRule());
    fake.failNext("alertDeliveries", "updateOne", { when: (filter, update, options) => options?.upsert });

    expect((await run(minutes(1))).errors).toBe(1);
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(subscription().pendingTransitionId).toBeTruthy();

    expect((await run(minutes(5))).inFlight).toBe(1);
    expect((await run(minutes(16))).released).toBe(1);
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });

    expect((await run(minutes(31))).sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
  });

  test("delivery intent committed but acknowledgement lost: the unsent claim is sent once after it goes stale", async () => {
    seed(gaugeRule());
    fake.failNext("alertDeliveries", "updateOne", { when: (filter, update, options) => options?.upsert, afterApply: true });

    await run(minutes(1));
    expect(deliveries()[0]).toMatchObject({ state: "claimed" });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();

    expect((await run(minutes(16))).sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(sentKeys()[0]).toBe(deliveries()[0].idempotencyKey);
  });

  test("sent but subscription completion fails: the next run completes it without resending", async () => {
    seed(gaugeRule());
    fake.failNext("alertSubscriptions", "updateOne", { when: (filter, update) => Boolean(update.$set?.lastTriggeredAt) });

    expect((await run(minutes(1))).errors).toBe(1);
    expect(deliveries()[0].state).toBe("sent");

    const next = await run(minutes(16));
    expect(next).toMatchObject({ sent: 0, suppressed: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastTriggeredAt: minutes(16).toISOString() });
    expect(subscription().pendingTransitionId).toBeUndefined();
  });

  test("a database failure on one rule does not stop evaluation of the others", async () => {
    const other = gaugeRule({ alertKey: "other@example.com|gauge|4009-level|live|above|1.5", email: "other@example.com" });
    seed(gaugeRule(), other);
    fake.failNext("alertSubscriptions", "updateOne", { when: (filter, update) => filter.alertKey === GAUGE_KEY && Boolean(update.$inc) });

    const result = await run(minutes(1));

    expect(result).toMatchObject({ scanned: 2, sent: 1, errors: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "other@example.com" }));
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });
    expect(runs()[0].status).toBe("degraded");

    expect((await run(minutes(16))).sent).toBe(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });
});

describe("run records", () => {
  test("records the run as running before any subscription work, then its outcome", async () => {
    seed(gaugeRule());

    const result = await run(minutes(1));

    const firstRunWrite = fake.calls.findIndex((call) => call.collection === "alertRuns" && call.op === "insertOne");
    const firstSubscriptionCall = fake.calls.findIndex((call) => call.collection === "alertSubscriptions");
    expect(firstRunWrite).toBeGreaterThanOrEqual(0);
    expect(firstRunWrite).toBeLessThan(firstSubscriptionCall);
    expect(fake.calls[firstRunWrite].args[0]).toMatchObject({ status: "running", runId: result.runId });
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ runId: result.runId, status: "success", scanned: 1, sent: 1, startedAt: minutes(1).toISOString() });
    expect(runs()[0].completedAt).toBeTruthy();
    expect(JSON.stringify(runs()[0])).not.toContain("user@example.com");
  });

  test("marks interrupted earlier runs incomplete without touching an overlapping one", async () => {
    fake.docs("alertRuns").push({ runId: "interrupted", status: "running", startedAt: minutes(-120).toISOString() }, { runId: "overlapping", status: "running", startedAt: minutes(-5).toISOString() });

    const result = await run(T0);

    expect(result.incompleteRunsReconciled).toBe(1);
    expect(runs().find((doc) => doc.runId === "interrupted")).toMatchObject({ status: "incomplete", reconciledByRunId: result.runId });
    expect(runs().find((doc) => doc.runId === "overlapping").status).toBe("running");
  });

  test("records a failed run when evaluation cannot proceed", async () => {
    seed(gaugeRule());
    fake.failNext("alertSubscriptions", "find");

    await expect(run(minutes(1))).rejects.toThrow("simulated database failure");

    expect(runs()[0]).toMatchObject({ status: "failed", errorCategory: "MongoNetworkError" });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });

  test("does not evaluate or send when the run cannot be recorded", async () => {
    seed(gaugeRule());
    fake.failNext("alertRuns", "insertOne");

    await expect(run(minutes(1))).rejects.toThrow();

    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });
  });

  test("reports stale claims left by earlier versions for review", async () => {
    fake.docs("alertDeliveries").push({ alertKey: "old", transitionId: "old:1", state: "claimed", createdAt: hours(-48).toISOString(), updatedAt: hours(-48).toISOString() });

    const result = await run(T0);

    expect(result.outstandingDeliveries).toEqual({ staleClaims: 1, uncertain: 0, heldForReview: 0 });
    expect(result.needsReview).toBe(true);
    expect(deliveries()[0].state).toBe("claimed");
  });
});

describe("existing subscription and delivery data", () => {
  test("legacy triggered subscriptions without a revision re-arm and keep their other fields", async () => {
    const legacy = gaugeRule({ lastConditionState: "triggered", lastTriggeredAt: "2026-10-30T10:00:00.000Z" });
    seed(legacy);
    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.4, T0));

    expect((await run(minutes(1))).rearmed).toBe(1);

    expect(subscription()).toMatchObject({ ...legacy, lastConditionState: "armed", stateRevision: 1 });
  });

  test("a legacy sent delivery for the same transition is not resent", async () => {
    seed(gaugeRule());
    const transitionId = `${GAUGE_KEY}:${T0.toISOString()}:1.72`;
    fake.docs("alertDeliveries").push({ alertKey: GAUGE_KEY, transitionId, idempotencyKey: "legacy-key", state: "sent", sentAt: T0.toISOString(), createdAt: T0.toISOString() });

    const result = await run(minutes(1));

    expect(result).toMatchObject({ sent: 0, suppressed: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(deliveries()[0]).toMatchObject({ idempotencyKey: "legacy-key", state: "sent", sentAt: T0.toISOString() });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });

  test("a recent legacy claimed delivery is retried with its original idempotency key", async () => {
    seed(gaugeRule());
    const transitionId = `${GAUGE_KEY}:${T0.toISOString()}:1.72`;
    fake.docs("alertDeliveries").push({ alertKey: GAUGE_KEY, transitionId, idempotencyKey: "legacy-key", state: "claimed", createdAt: T0.toISOString(), updatedAt: T0.toISOString() });

    expect((await run(minutes(30))).sent).toBe(1);
    expect(sentKeys()).toEqual(["legacy-key"]);
    expect(deliveries()[0]).toMatchObject({ state: "sent", attempts: 2 });
  });

  test("an old legacy claimed delivery is held for review rather than resent", async () => {
    seed(gaugeRule());
    const transitionId = `${GAUGE_KEY}:${T0.toISOString()}:1.72`;
    fake.docs("alertDeliveries").push({ alertKey: GAUGE_KEY, transitionId, idempotencyKey: "legacy-key", state: "claimed", createdAt: T0.toISOString(), updatedAt: T0.toISOString() });

    expect((await run(hours(48))).heldForReview).toBe(1);
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(deliveries()[0]).toMatchObject({ state: "held_for_review", heldReason: "idempotency_window_expired" });
  });

  test("pending-confirmation and unsubscribed subscriptions are not evaluated", async () => {
    seed(gaugeRule({ alertKey: "a", status: "pending_confirmation" }), gaugeRule({ alertKey: "b", status: "unsubscribed" }));

    expect((await run(minutes(1))).scanned).toBe(0);
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });
});

describe("index provisioning", () => {
  test("verifies the unique delivery index without creating it at runtime", async () => {
    seed(gaugeRule());

    const result = await run(minutes(1));

    expect(result.deliveryIndex).toBe("present");
    expect(fake.calls.some((call) => call.op === "createIndex")).toBe(false);
  });

  test("reports a missing unique delivery index as degraded", async () => {
    await jest.isolateModulesAsync(async () => {
      const { connectToDatabase: isolatedConnect } = require("../libs/database");
      const { runColwickAlerts: isolatedRun } = require("../libs/services/colwickAlertsService");
      const unindexed = createFakeDb();
      isolatedConnect.mockResolvedValue({ db: unindexed.db });

      const result = await isolatedRun({ now: minutes(1) });

      expect(result.deliveryIndex).toBe("missing");
      expect(unindexed.docs("alertRuns")[0].status).toBe("degraded");
      expect(unindexed.calls.some((call) => call.op === "createIndex")).toBe(false);
    });
  });
});

describe("existing alert types", () => {
  test("HPP, water-quality and forecast alerts still notify once through the same path", async () => {
    seed(
      gaugeRule({ alertKey: "hpp", alertType: "hpp_status", desiredStatus: "open", gaugeKey: undefined, source: undefined, direction: undefined, threshold: undefined }),
      gaugeRule({ alertKey: "water", alertType: "water_quality", riskLevel: "amber", gaugeKey: undefined, source: undefined, direction: undefined, threshold: undefined }),
      gaugeRule({ alertKey: "forecast", source: "forecast", direction: "below", threshold: 1.5 })
    );
    getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: true, health: { generatedAt: T0.toISOString() } } });
    getCsoActivityAssessment.mockReturnValue({ level: "high" });
    getLatestForecastSnapshot.mockResolvedValue({ metadata: { forecast_time: T0.toISOString() }, forecast_data: [{ forecast_date: hours(2).toISOString(), forecast_reading: 1.48 }] });

    const first = await run(minutes(1));
    const repeat = await run(minutes(16));

    expect(first.sent).toBe(3);
    expect(repeat.sent).toBe(0);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(3);
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ gaugeName: "HPP opens", source: "status", observedValue: null }));
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ gaugeName: "CSO risk reaches amber" }));
    expect(sendThresholdAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ source: "forecast", observedAt: hours(2).toISOString(), forecastRunAt: T0.toISOString() }));
    ["hpp", "water", "forecast"].forEach((key) => expect(subscription(key)).toMatchObject({ lastConditionState: "triggered" }));
  });

  test("an unavailable source skips only its own rules", async () => {
    seed(gaugeRule(), gaugeRule({ alertKey: "forecast", source: "forecast", direction: "above" }));
    getLatestForecastSnapshot.mockRejectedValue(new Error("forecast unavailable"));

    const result = await run(minutes(1));

    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect(result.sourceFailures).toEqual(["forecast"]);
    expect(subscription("forecast")).toMatchObject({ lastConditionState: "armed", lastEvaluatedAt: minutes(1).toISOString() });
    expect(runs()[0].status).toBe("degraded");
  });

  test("hysteresis is unchanged: a reading inside the margin neither re-arms nor resends", async () => {
    seed(gaugeRule({ lastConditionState: "triggered" }));
    getLegacyTrentWeirsSnapshot.mockResolvedValue(trentAt(1.48, T0));

    const result = await run(minutes(1));

    expect(result).toMatchObject({ rearmed: 0, sent: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });
});
