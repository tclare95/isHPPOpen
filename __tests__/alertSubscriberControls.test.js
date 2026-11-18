/** @jest-environment node */
// Wave B subscriber controls: edit, pause and resume through the management link. Edits and resumes re-baseline,
// so the change alone never notifies; paused rules are not evaluated; pending rules are never activated; changes are
// scoped to the link's address and conditional, so races and retries cannot duplicate or resurrect a rule.
// In-memory doubles only; no email provider or database is contacted.
import { createHash } from "node:crypto";
import { createFakeDb } from "../testUtils/fakeMongo";
import { createGaugeFeeds } from "../testUtils/fakeGaugeFeeds";

jest.mock("server-only", () => ({}));
jest.mock("../libs/database");
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));
jest.mock("../libs/services/alertMailerService", () => ({
  ...jest.requireActual("../libs/services/alertMailerService"),
  sendAlertConfirmationEmail: jest.fn(),
  sendManageAlertsAccessEmail: jest.fn(),
  sendThresholdAlertEmail: jest.fn(),
}));
jest.mock("../libs/services/forecastService", () => ({ getLatestForecastSnapshot: jest.fn() }));
jest.mock("../libs/services/hppStatusService", () => ({ getHppStatusSnapshot: jest.fn() }));
jest.mock("../libs/services/waterQualityService", () => ({ getLatestWaterQualitySummaryHealth: jest.fn(), getWaterQualityDensitySeries: jest.fn() }));
jest.mock("../libs/waterQualityIndicator", () => ({ getCsoActivityAssessment: jest.fn() }));
jest.mock("../libs/services/waterQualityAssessmentService", () => ({
  ...jest.requireActual("../libs/services/waterQualityAssessmentService"),
  getRdpAlertAssessment: jest.fn(),
}));

const { connectToDatabase } = require("../libs/database");
const { createRdpClient } = require("../libs/rdp/client");
const { sendAlertConfirmationEmail, sendThresholdAlertEmail } = require("../libs/services/alertMailerService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const { getHppStatusSnapshot } = require("../libs/services/hppStatusService");
const { getLatestWaterQualitySummaryHealth, getWaterQualityDensitySeries } = require("../libs/services/waterQualityService");
const { getCsoActivityAssessment } = require("../libs/waterQualityIndicator");
const { getRdpAlertAssessment } = require("../libs/services/waterQualityAssessmentService");
const {
  ALERT_CHANGE_MESSAGES,
  createColwickAlertSubscription,
  confirmColwickAlertSubscription,
  deleteManagedColwickAlert,
  editManagedColwickAlert,
  listColwickAlertsForManagement,
  pauseManagedColwickAlert,
  resumeManagedColwickAlert,
  runColwickAlerts,
  unsubscribeColwickAlertSubscription,
} = require("../libs/services/colwickAlertsService");

const T0 = new Date("2026-11-18T12:00:00.000Z");
const minutes = (count) => new Date(T0.getTime() + count * 60000);
const hours = (count) => minutes(count * 60);
const EMAIL = "user@example.com";
const TOKEN = "manage-token";
const FORECAST_KEY = `${EMAIL}|gauge|4009-level|forecast|above|2`;
const FORECAST_EDITED_KEY = `${EMAIL}|gauge|4009-level|forecast|above|1.5`;
const LIVE_KEY = `${EMAIL}|gauge|4009-level|live|above|2`;
const HPP_CLOSED_KEY = `${EMAIL}|hpp_status|closed|||`;
const HPP_OPEN_KEY = `${EMAIL}|hpp_status|open|||`;
const WQ_KEY = `${EMAIL}|water_quality|red|||`;

const forecastRule = (overrides = {}) => ({ alertKey: FORECAST_KEY, email: EMAIL, alertType: "gauge", gaugeKey: "4009-level", gaugeName: "Colwick", stationId: 4009, measureType: "level",
  source: "forecast", direction: "above", threshold: 2, status: "active", lastConditionState: "armed", lastEvaluatedAt: T0.toISOString(), stateRevision: 3, unsubscribeToken: "unsub-forecast", ...overrides });
const liveRule = (overrides = {}) => forecastRule({ alertKey: LIVE_KEY, source: "live", unsubscribeToken: "unsub-live", ...overrides });
const hppRule = (overrides = {}) => ({ alertKey: HPP_CLOSED_KEY, email: EMAIL, alertType: "hpp_status", desiredStatus: "closed", gaugeName: "HPP status", status: "active",
  lastConditionState: "armed", lastEvaluatedAt: T0.toISOString(), stateRevision: 1, unsubscribeToken: "unsub-hpp", ...overrides });
const wqRule = (overrides = {}) => ({ alertKey: WQ_KEY, email: EMAIL, alertType: "water_quality", riskLevel: "red", gaugeName: "Water quality", status: "active",
  lastConditionState: "armed", lastEvaluatedAt: T0.toISOString(), unsubscribeToken: "unsub-wq", ...overrides });

let fake;
let feeds;
const seed = (...rules) => fake.docs("alertSubscriptions").push(...rules.map((entry) => structuredClone(entry)));
const subscriptions = () => fake.docs("alertSubscriptions");
const subscription = (key) => subscriptions().find((doc) => doc.alertKey === key);
const seedSession = ({ email = EMAIL, token = TOKEN, expiresAt = hours(10) } = {}) => fake.docs("alertManageSessions")
  .push({ email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: expiresAt.toISOString() });
const run = (now) => runColwickAlerts({ now });
const forecast = (runAt, readings) => getLatestForecastSnapshot.mockResolvedValue({ metadata: { forecast_time: runAt.toISOString() },
  forecast_data: readings.map(([value, at]) => ({ forecast_date: at.toISOString(), forecast_reading: value })) });
const hpp = (open, at) => getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: open, health: { generatedAt: at.toISOString() } } });
const edit = (alertKey, changes, now = minutes(1), token = TOKEN) => editManagedColwickAlert({ token, alertKey, changes }, { now });
const pause = (alertKey, now = minutes(1), token = TOKEN) => pauseManagedColwickAlert({ token, alertKey }, { now });
const resume = (alertKey, now = minutes(1), token = TOKEN) => resumeManagedColwickAlert({ token, alertKey }, { now });
const rdpRisk = (level, at) => getRdpAlertAssessment.mockResolvedValue({ version: "hpp-upstream-activity/v1",
  current: { factors: { cso: { level, possibleLevels: [level, level], observedAt: at.toISOString(), unknown: 0 } } } });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RDP_WQ_ASSESSMENT;
  delete process.env.RDP_GAUGE_ALERTS_SOURCE;
  fake = createFakeDb({ uniqueIndexes: { alertDeliveries: [{ alertKey: 1, transitionId: 1 }] } });
  feeds = createGaugeFeeds();
  connectToDatabase.mockResolvedValue({ db: fake.db });
  jest.spyOn(global, "fetch").mockImplementation(feeds.fetch);
  createRdpClient.mockReturnValue(feeds.client);
  getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });
  hpp(false, T0);
  getLatestWaterQualitySummaryHealth.mockResolvedValue({ ScrapeTimestamp: T0.toISOString() });
  getWaterQualityDensitySeries.mockResolvedValue([]);
  getCsoActivityAssessment.mockReturnValue({ level: "lower" });
  rdpRisk("lower", T0);
  sendThresholdAlertEmail.mockResolvedValue(undefined);
  seedSession();
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  delete process.env.RDP_WQ_ASSESSMENT;
  delete process.env.RDP_GAUGE_ALERTS_SOURCE;
});

describe("editing re-baselines instead of notifying", () => {
  test("lowering a forecast threshold below a current crossing sends nothing; only a fresh crossing after a clear notifies", async () => {
    seed(forecastRule());
    forecast(T0, [[1.7, hours(2)]]);

    await expect(edit(FORECAST_KEY, { threshold: 1.5 })).resolves.toMatchObject({ message: ALERT_CHANGE_MESSAGES.edited, alertKey: FORECAST_EDITED_KEY, changed: true });
    expect(subscription(FORECAST_KEY)).toBeUndefined();
    expect(subscription(FORECAST_EDITED_KEY)).toMatchObject({ threshold: 1.5, status: "active", unsubscribeToken: "unsub-forecast", rebaseline: { reason: "edited" }, stateRevision: 4 });

    expect(await run(minutes(2))).toMatchObject({ sent: 0, enrolled: 1 });
    expect(subscription(FORECAST_EDITED_KEY)).toMatchObject({ lastConditionState: "triggered" });
    expect(subscription(FORECAST_EDITED_KEY).rebaseline).toBeUndefined();
    expect(await run(minutes(17))).toMatchObject({ sent: 0 });

    forecast(hours(1), [[1.3, hours(3)]]);
    expect(await run(minutes(62))).toMatchObject({ rearmed: 1, sent: 0 });
    forecast(hours(2), [[1.6, hours(4)]]);
    expect(await run(minutes(122))).toMatchObject({ sent: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendThresholdAlertEmail.mock.calls[0][0]).toMatchObject({ threshold: 1.5, unsubscribeToken: "unsub-forecast" });
  });

  test("an edit while evidence is unavailable stays quiet until a run can re-baseline it", async () => {
    seed(forecastRule());
    await edit(FORECAST_KEY, { threshold: 1.5 });
    getLatestForecastSnapshot.mockRejectedValue(new Error("down"));
    expect(await run(minutes(2))).toMatchObject({ sent: 0, skipped: 1 });
    expect(subscription(FORECAST_EDITED_KEY).rebaseline).toBeDefined();

    forecast(minutes(10), [[1.7, hours(2)]]);
    expect(await run(minutes(17))).toMatchObject({ sent: 0, enrolled: 1 });
  });

  test("switching an HPP alert to the status HPP is already in sends nothing", async () => {
    seed(hppRule());
    hpp(true, T0);
    await edit(HPP_CLOSED_KEY, { desiredStatus: "open" });

    expect(await run(minutes(2))).toMatchObject({ sent: 0, enrolled: 1 });
    expect(subscription(HPP_OPEN_KEY)).toMatchObject({ desiredStatus: "open", lastConditionState: "triggered" });
    hpp(false, minutes(20));
    await run(minutes(21));
    hpp(true, minutes(40));
    expect(await run(minutes(41))).toMatchObject({ sent: 1 });
  });

  test("a live gauge edit re-baselines from the newest fresh reading with a new progress marker", async () => {
    seed(liveRule({ lastObservedAt: "2026-11-18T11:45:00Z", lastObservedValue: 1.6, lastObservedSource: "legacy", lastObservedState: "armed", lastObservedTransitionId: null }));
    feeds.add("legacy", "4009-level", 1.6, minutes(-15));
    feeds.add("legacy", "4009-level", 1.7, T0);
    await edit(LIVE_KEY, { threshold: 1.5 });
    const editedKey = `${EMAIL}|gauge|4009-level|live|above|1.5`;
    expect(subscription(editedKey).lastObservedAt).toBeUndefined();

    expect(await run(minutes(2))).toMatchObject({ sent: 0, enrolled: 1 });
    expect(subscription(editedKey)).toMatchObject({ lastConditionState: "triggered", lastObservedState: "triggered", lastObservedValue: 1.7 });
    feeds.add("legacy", "4009-level", 1.4, minutes(15));
    expect(await run(minutes(17))).toMatchObject({ rearmed: 1, sent: 0 });
    feeds.add("legacy", "4009-level", 1.55, minutes(30));
    expect(await run(minutes(32))).toMatchObject({ sent: 1 });
  });

  test("invalid or unsupported changes are refused and the rule stays intact", async () => {
    seed(forecastRule());
    const before = structuredClone(subscription(FORECAST_KEY));

    await expect(edit(FORECAST_KEY, { threshold: "deep" })).rejects.toMatchObject({ name: "ValidationError" });
    await expect(edit(FORECAST_KEY, { threshold: -1 })).rejects.toMatchObject({ name: "ValidationError" });
    await expect(edit(FORECAST_KEY, { gaugeKey: "4007-flow" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(edit(FORECAST_KEY, { alertType: "hpp_status" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(edit(FORECAST_KEY, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(edit(HPP_CLOSED_KEY, { threshold: 1 })).rejects.toMatchObject({ statusCode: 404 });
    expect(subscription(FORECAST_KEY)).toEqual(before);
  });

  test("saving the same conditions changes nothing", async () => {
    seed(forecastRule());
    await expect(edit(FORECAST_KEY, { threshold: 2, direction: "above" })).resolves.toMatchObject({ changed: false, message: ALERT_CHANGE_MESSAGES.unchanged });
    expect(subscription(FORECAST_KEY)).toMatchObject({ stateRevision: 3 });
    expect(subscription(FORECAST_KEY).rebaseline).toBeUndefined();
  });

  test("the unsubscribe link from earlier emails still stops the edited alert", async () => {
    seed(forecastRule());
    await edit(FORECAST_KEY, { threshold: 1.5 });
    await unsubscribeColwickAlertSubscription("unsub-forecast", { now: minutes(2) });
    expect(subscription(FORECAST_EDITED_KEY).status).toBe("unsubscribed");
  });
});

describe("pause and resume", () => {
  test("a paused alert is not evaluated, and resuming does not notify for what happened while paused", async () => {
    seed(hppRule());
    await expect(pause(HPP_CLOSED_KEY)).resolves.toEqual({ message: ALERT_CHANGE_MESSAGES.paused });
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "paused", pausedAt: minutes(1).toISOString() });

    hpp(true, minutes(10));
    await run(minutes(11));
    hpp(false, minutes(20));
    expect(await run(minutes(21))).toMatchObject({ scanned: 0, sent: 0 });

    await expect(resume(HPP_CLOSED_KEY, minutes(25))).resolves.toEqual({ message: ALERT_CHANGE_MESSAGES.resumed });
    expect(subscription(HPP_CLOSED_KEY).pausedAt).toBeUndefined();
    expect(await run(minutes(26))).toMatchObject({ sent: 0, enrolled: 1 });
    expect(subscription(HPP_CLOSED_KEY).lastConditionState).toBe("triggered");

    hpp(true, minutes(40));
    expect(await run(minutes(41))).toMatchObject({ rearmed: 1, sent: 0 });
    hpp(false, minutes(55));
    expect(await run(minutes(56))).toMatchObject({ sent: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
  });

  test("resuming a CSO alert under the RDP assessment while risk is high stays quiet until it clears", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    seed(wqRule({ status: "paused", pausedAt: T0.toISOString() }));
    rdpRisk("high", T0);
    await resume(WQ_KEY);

    expect(await run(minutes(2))).toMatchObject({ sent: 0, enrolled: 1 });
    expect(subscription(WQ_KEY).wqAssessment).toMatchObject({ suppressUntilClear: true, state: "armed" });
    expect(await run(minutes(17))).toMatchObject({ sent: 0 });
    rdpRisk("lower", minutes(30));
    await run(minutes(31));
    rdpRisk("high", minutes(45));
    expect(await run(minutes(46))).toMatchObject({ sent: 1 });
  });

  test("an evaluation that read the rule before a pause cannot trigger it", async () => {
    seed(hppRule());
    hpp(false, minutes(5)); // a "closed" alert whose condition is now met
    const rules = fake.db.collection("alertSubscriptions");
    const realFind = rules.find;
    rules.find = (filter) => ({ toArray: async () => {
      const read = await realFind(filter).toArray();
      await pause(HPP_CLOSED_KEY, minutes(6)); // committed after the run read the rule
      return read;
    } });

    expect(await run(minutes(6))).toMatchObject({ scanned: 1, sent: 0, suppressed: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(fake.docs("alertDeliveries")).toHaveLength(0);
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "paused", lastConditionState: "armed" });
  });

  test("pause and resume are idempotent when retried", async () => {
    seed(hppRule());
    await pause(HPP_CLOSED_KEY);
    await expect(pause(HPP_CLOSED_KEY)).resolves.toEqual({ message: ALERT_CHANGE_MESSAGES.alreadyPaused });
    expect(subscription(HPP_CLOSED_KEY).stateRevision).toBe(2);
    await resume(HPP_CLOSED_KEY);
    await expect(resume(HPP_CLOSED_KEY)).resolves.toEqual({ message: ALERT_CHANGE_MESSAGES.alreadyActive });
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "active", stateRevision: 3 });
  });

  test("an alert with an email being sent is not paused or edited until that delivery finishes", async () => {
    seed(hppRule({ pendingTransitionId: "t1", pendingSince: T0.toISOString(), lastConditionState: "triggered" }));
    await expect(pause(HPP_CLOSED_KEY)).rejects.toMatchObject({ statusCode: 409 });
    await expect(edit(HPP_CLOSED_KEY, { desiredStatus: "open" })).rejects.toMatchObject({ statusCode: 409 });
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "active", pendingTransitionId: "t1", stateRevision: 1 });
  });

  test("editing a paused alert keeps it paused", async () => {
    seed(hppRule({ status: "paused", pausedAt: T0.toISOString() }));
    await edit(HPP_CLOSED_KEY, { desiredStatus: "open" });
    expect(subscription(HPP_OPEN_KEY)).toMatchObject({ status: "paused", pausedAt: T0.toISOString() });
    expect(await run(minutes(2))).toMatchObject({ scanned: 0 });
  });
});

describe("pending confirmation stays inactive", () => {
  test("edit, pause and resume refuse an unconfirmed alert without changing it", async () => {
    seed(hppRule({ status: "pending_confirmation", confirmationTokenHash: "h", confirmationExpiresAt: hours(24).toISOString() }));
    const before = structuredClone(subscription(HPP_CLOSED_KEY));

    await expect(edit(HPP_CLOSED_KEY, { desiredStatus: "open" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(resume(HPP_CLOSED_KEY)).rejects.toMatchObject({ statusCode: 409 });
    await expect(pause(HPP_CLOSED_KEY)).rejects.toMatchObject({ statusCode: 409 });
    expect(subscription(HPP_CLOSED_KEY)).toEqual(before);
    expect(await run(minutes(2))).toMatchObject({ scanned: 0 });
  });

  test("re-requesting a paused alert neither resets nor resumes it; its confirmation reports it as paused", async () => {
    seed(hppRule({ status: "paused", pausedAt: T0.toISOString(), stateRevision: 7 }));
    await createColwickAlertSubscription({ email: EMAIL, alertType: "hpp_status", desiredStatus: "closed" }, { now: minutes(1) });
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "paused", stateRevision: 7, unsubscribeToken: "unsub-hpp" });

    const { confirmationToken } = sendAlertConfirmationEmail.mock.calls[0][0];
    await expect(confirmColwickAlertSubscription(confirmationToken, { now: minutes(2) })).resolves.toMatchObject({ status: "already_paused" });
    expect(subscription(HPP_CLOSED_KEY)).toMatchObject({ status: "paused", stateRevision: 7 });
  });
});

describe("authorization", () => {
  test("invalid or expired links are refused without revealing any subscriber detail", async () => {
    seed(forecastRule());
    fake.docs("alertManageSessions").length = 0;
    seedSession({ token: "expired", expiresAt: T0 });
    const before = structuredClone(subscription(FORECAST_KEY));

    for (const token of ["wrong", "expired", ""]) {
      for (const attempt of [edit(FORECAST_KEY, { threshold: 1 }, minutes(1), token), pause(FORECAST_KEY, minutes(1), token), resume(FORECAST_KEY, minutes(1), token)]) {
        const error = await attempt.catch((caught) => caught);
        expect([400, 404]).toContain(error.statusCode);
        expect(error.message).not.toMatch(/example\.com|Colwick|forecast/i);
      }
    }
    expect(subscription(FORECAST_KEY)).toEqual(before);
  });

  test("a link cannot change another subscriber's alert", async () => {
    const otherKey = "someone@example.com|hpp_status|closed|||";
    seed(hppRule({ alertKey: otherKey, email: "someone@example.com" }));
    for (const attempt of [edit(otherKey, { desiredStatus: "open" }), pause(otherKey), resume(otherKey)]) {
      await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(subscription(otherKey)).toMatchObject({ status: "active", stateRevision: 1 });
  });
});

describe("races, retries and removed alerts", () => {
  test("a removed alert is never brought back by a later edit, pause or resume", async () => {
    seed(hppRule());
    await deleteManagedColwickAlert({ token: TOKEN, alertKey: HPP_CLOSED_KEY }, { now: minutes(1) });
    for (const attempt of [edit(HPP_CLOSED_KEY, { desiredStatus: "open" }), pause(HPP_CLOSED_KEY), resume(HPP_CLOSED_KEY)]) {
      await expect(attempt).rejects.toMatchObject({ statusCode: 404 });
    }
    expect(subscriptions()).toHaveLength(1);
    expect(subscription(HPP_CLOSED_KEY).status).toBe("unsubscribed");
  });

  test("a removal racing an edit never leaves a live rule after a successful removal", async () => {
    seed(hppRule());
    const [removal, change] = await Promise.allSettled([
      deleteManagedColwickAlert({ token: TOKEN, alertKey: HPP_CLOSED_KEY }, { now: minutes(1) }),
      edit(HPP_CLOSED_KEY, { desiredStatus: "open" }),
    ]);
    const live = subscriptions().filter((doc) => doc.status !== "unsubscribed");

    expect([removal.status, change.status].filter((status) => status === "fulfilled")).toHaveLength(1);
    expect(live).toHaveLength(removal.status === "fulfilled" ? 0 : 1);
  });

  test("two concurrent changes: one wins, the other is refused, and one live rule remains", async () => {
    seed(forecastRule());
    const outcomes = await Promise.allSettled([edit(FORECAST_KEY, { threshold: 1.5 }), edit(FORECAST_KEY, { threshold: 1.8 }), pause(FORECAST_KEY)]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    outcomes.filter((outcome) => outcome.status === "rejected").forEach((outcome) => expect([404, 409]).toContain(outcome.reason.statusCode));
    expect(subscriptions().filter((doc) => doc.status !== "unsubscribed")).toHaveLength(1);
  });

  test("an edit refused by a stale read reports a change, not success", async () => {
    seed(forecastRule());
    // An evaluation run advances the rule between the edit's read and its write.
    const rules = fake.db.collection("alertSubscriptions");
    const realFindOne = rules.findOne;
    rules.findOne = async (filter, options) => {
      const result = await realFindOne(filter, options);
      if (filter.alertKey === FORECAST_EDITED_KEY) subscription(FORECAST_KEY).stateRevision += 1;
      return result;
    };

    await expect(edit(FORECAST_KEY, { threshold: 1.5 })).rejects.toMatchObject({ statusCode: 409 });
    expect(subscription(FORECAST_KEY)).toMatchObject({ threshold: 2, status: "active" });
    expect(subscription(FORECAST_EDITED_KEY)).toBeUndefined();
  });

  test("an edit onto the conditions of another live alert is refused, so there is never a duplicate", async () => {
    seed(forecastRule(), forecastRule({ alertKey: FORECAST_EDITED_KEY, threshold: 1.5, status: "pending_confirmation", unsubscribeToken: "other" }));
    await expect(edit(FORECAST_KEY, { threshold: 1.5 })).rejects.toMatchObject({ statusCode: 409 });
    expect(subscription(FORECAST_KEY)).toMatchObject({ threshold: 2, status: "active" });
    expect(subscription(FORECAST_EDITED_KEY)).toMatchObject({ status: "pending_confirmation" });
  });

  test("an edit onto the conditions of a removed alert retires that record instead of reviving it", async () => {
    seed(forecastRule(), forecastRule({ alertKey: FORECAST_EDITED_KEY, threshold: 1.5, status: "unsubscribed", unsubscribeToken: "old", lastConditionState: "triggered", pendingTransitionId: "old" }));
    await edit(FORECAST_KEY, { threshold: 1.5 });

    const atKey = subscriptions().filter((doc) => doc.alertKey === FORECAST_EDITED_KEY);
    expect(atKey).toHaveLength(1);
    expect(atKey[0]).toMatchObject({ status: "active", unsubscribeToken: "unsub-forecast" });
    expect(atKey[0].pendingTransitionId).toBeUndefined();
    expect(subscriptions().find((doc) => doc.unsubscribeToken === "old")).toMatchObject({ status: "unsubscribed", alertKey: expect.stringContaining("|superseded:") });
  });
});

describe("status view", () => {
  // Each read replaces the link's token, so every read here uses a freshly issued link.
  let links = 0;
  const list = (now = minutes(5)) => {
    const token = `link-${(links += 1)}`;
    fake.docs("alertManageSessions").length = 0;
    seedSession({ token });
    return listColwickAlertsForManagement(token, { now });
  };
  const recordRun = (overrides) => fake.docs("alertRuns").push({ runId: "r", status: "success", startedAt: minutes(1).toISOString(), sourceFailures: [], ...overrides });

  test("shows active, paused and pending alerts with their conditions, restart and last trigger", async () => {
    seed(forecastRule({ lastTriggeredAt: T0.toISOString(), rebaseline: { reason: "edited", requestedAt: T0.toISOString() } }), hppRule({ status: "paused", pausedAt: T0.toISOString() }),
      wqRule({ status: "pending_confirmation" }));
    recordRun();
    const { alerts } = await list();
    const byKey = Object.fromEntries(alerts.map((alert) => [alert.alertKey, alert]));

    expect(byKey[FORECAST_KEY]).toMatchObject({ status: "active", threshold: 2, unit: "m", direction: "above", restarting: true, lastTriggeredAt: T0.toISOString(), evidence: "current" });
    expect(byKey[HPP_CLOSED_KEY]).toMatchObject({ status: "paused", pausedAt: T0.toISOString(), restarting: false, evidence: null });
    expect(byKey[WQ_KEY]).toMatchObject({ status: "pending_confirmation", evidence: null });
    expect(JSON.stringify(alerts)).not.toMatch(/unsub-|rebaseline|stateRevision/);
  });

  test("never implies assured delivery when the evaluator's evidence is late, failing or missing", async () => {
    seed(forecastRule(), liveRule({ gaugeHold: { reason: "continuity_unproven" } }), hppRule());
    const evidence = async () => Object.fromEntries((await list()).alerts.map((alert) => [alert.alertKey, alert.evidence]));

    expect(await evidence()).toEqual({ [FORECAST_KEY]: "unknown", [LIVE_KEY]: "unknown", [HPP_CLOSED_KEY]: "unknown" });
    recordRun({ status: "degraded", sourceFailures: ["forecast"] });
    expect(await evidence()).toEqual({ [FORECAST_KEY]: "delayed", [LIVE_KEY]: "delayed", [HPP_CLOSED_KEY]: "current" });
    recordRun({ runId: "f", status: "failed", startedAt: minutes(2).toISOString() });
    expect(await evidence()).toEqual({ [FORECAST_KEY]: "unknown", [LIVE_KEY]: "unknown", [HPP_CLOSED_KEY]: "unknown" });
  });

  test("an old run is not treated as current evidence", async () => {
    seed(hppRule());
    recordRun({ startedAt: hours(-2).toISOString() });
    expect((await list()).alerts[0].evidence).toBe("unknown");
  });
});
