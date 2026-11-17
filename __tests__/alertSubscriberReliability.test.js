/** @jest-environment node */
// Subscriber-facing reliability fixes (Wave A, A3): valid subscriptions that could silently stop producing
// alerts. Each test reproduces one gap. In-memory doubles only; no email provider or database is contacted.
import { createFakeDb } from "../testUtils/fakeMongo";

jest.mock("server-only", () => ({}));
jest.mock("../libs/database");
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
const { sendAlertConfirmationEmail, sendThresholdAlertEmail } = require("../libs/services/alertMailerService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const { getHppStatusSnapshot } = require("../libs/services/hppStatusService");
const { getLatestWaterQualitySummaryHealth, getWaterQualityDensitySeries } = require("../libs/services/waterQualityService");
const { getCsoActivityAssessment } = require("../libs/waterQualityIndicator");
const { getRdpAlertAssessment } = require("../libs/services/waterQualityAssessmentService");
const {
  createColwickAlertSubscription,
  confirmColwickAlertSubscription,
  unsubscribeColwickAlertSubscription,
  runColwickAlerts,
} = require("../libs/services/colwickAlertsService");

const T0 = new Date("2026-11-16T12:00:00.000Z");
const minutes = (count) => new Date(T0.getTime() + count * 60000);
const hours = (count) => minutes(count * 60);
const FORECAST_KEY = "user@example.com|gauge|4009-level|forecast|above|1.5";
const WQ_KEY = "user@example.com|water_quality|amber|||";
const forecastRule = (overrides = {}) => ({ alertKey: FORECAST_KEY, email: "user@example.com", alertType: "gauge", gaugeKey: "4009-level", gaugeName: "Colwick", stationId: 4009,
  measureType: "level", source: "forecast", direction: "above", threshold: 1.5, status: "active", lastConditionState: "armed", unsubscribeToken: "u", ...overrides });
const wqRule = (overrides = {}) => ({ alertKey: WQ_KEY, email: "user@example.com", alertType: "water_quality", riskLevel: "amber", gaugeName: "Water quality", status: "active",
  lastConditionState: "armed", lastEvaluatedAt: "2026-11-16T11:45:00.000Z", unsubscribeToken: "u", ...overrides });
const forecast = (runAt, readings) => getLatestForecastSnapshot.mockResolvedValue({ metadata: { forecast_time: runAt.toISOString() },
  forecast_data: readings.map(([value, at]) => ({ forecast_date: at.toISOString(), forecast_reading: value })) });

let fake;
const seed = (...rules) => fake.docs("alertSubscriptions").push(...rules.map((entry) => structuredClone(entry)));
const subscription = (key) => fake.docs("alertSubscriptions").find((doc) => doc.alertKey === key);
const run = (now) => runColwickAlerts({ now });
const sentKeys = () => sendThresholdAlertEmail.mock.calls.map(([args]) => args.idempotencyKey);

beforeEach(() => {
  jest.clearAllMocks();
  fake = createFakeDb({ uniqueIndexes: { alertDeliveries: [{ alertKey: 1, transitionId: 1 }] } });
  connectToDatabase.mockResolvedValue({ db: fake.db });
  delete process.env.RDP_WQ_ASSESSMENT;
  getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });
  getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: false, health: { generatedAt: T0.toISOString() } } });
  getLatestWaterQualitySummaryHealth.mockResolvedValue({ ScrapeTimestamp: T0.toISOString() });
  getWaterQualityDensitySeries.mockResolvedValue([]);
  getCsoActivityAssessment.mockReturnValue({ level: "lower" });
  getRdpAlertAssessment.mockResolvedValue({ version: "hpp-upstream-activity/v1",
    current: { factors: { cso: { level: "lower", possibleLevels: ["lower", "lower"], observedAt: T0.toISOString(), unknown: 0 } } } });
  sendThresholdAlertEmail.mockResolvedValue(undefined);
});
afterAll(() => { delete process.env.RDP_WQ_ASSESSMENT; });

describe("forecast alerts re-arm (regression: they never notified again after the first alert)", () => {
  test("a forecast that clears by the hysteresis margin re-arms, and a later crossing notifies again", async () => {
    seed(forecastRule());
    forecast(T0, [[1.4, hours(1)], [1.62, hours(2)]]);
    expect(await run(minutes(1))).toMatchObject({ sent: 1 });

    forecast(hours(1), [[1.4, hours(2)], [1.3, hours(3)]]);
    expect(await run(minutes(61))).toMatchObject({ rearmed: 1, sent: 0 });
    expect(subscription(FORECAST_KEY).lastConditionState).toBe("armed");

    forecast(hours(2), [[1.55, hours(3)]]);
    expect(await run(minutes(121))).toMatchObject({ sent: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
  });

  test("hysteresis is kept: a forecast inside the margin or with an unreadable row does not re-arm", async () => {
    seed(forecastRule({ lastConditionState: "triggered" }));
    forecast(T0, [[1.4, hours(1)], [1.48, hours(2)]]);
    expect(await run(minutes(1))).toMatchObject({ rearmed: 0 });

    forecast(hours(1), [[1.2, hours(2)], [null, hours(3)]]);
    expect(await run(minutes(61))).toMatchObject({ rearmed: 0 });
    expect(subscription(FORECAST_KEY).lastConditionState).toBe("triggered");
  });

  test("a missing forecast reading is not treated as 0 m for a 'below' rule", async () => {
    seed(forecastRule({ alertKey: "below", direction: "below", threshold: 0.5 }));
    forecast(T0, [[null, hours(1)], ["", hours(2)], [0.9, hours(3)]]);

    expect(await run(minutes(1))).toMatchObject({ sent: 0 });
  });

  test("a later forecast run predicting the same time and value after re-arming is a new transition, not a swallowed duplicate", async () => {
    seed(forecastRule());
    forecast(T0, [[1.62, hours(3)]]);
    await run(minutes(1));
    forecast(hours(1), [[1.3, hours(3)]]);
    await run(minutes(61));

    forecast(hours(2), [[1.62, hours(3)]]);
    const third = await run(minutes(121));

    expect(third).toMatchObject({ sent: 1, suppressed: 0 });
    expect(new Set(sentKeys()).size).toBe(2);
    // Duplicate protection is unchanged: re-evaluating the same forecast run sends nothing more.
    expect(await run(minutes(136))).toMatchObject({ sent: 0 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
  });
});

describe("water-quality assessment markers are written (regression: `$unset: undefined` is rejected by MongoDB)", () => {
  test("rdp mode enrols an existing rule without a per-rule database error, then notifies on a real crossing", async () => {
    process.env.RDP_WQ_ASSESSMENT = "rdp";
    seed(wqRule());

    const first = await run(minutes(1));
    expect(first).toMatchObject({ enrolled: 1, errors: 0 });
    expect(subscription(WQ_KEY).wqAssessment).toMatchObject({ version: "hpp-upstream-activity/v1", state: "armed" });

    getRdpAlertAssessment.mockResolvedValue({ version: "hpp-upstream-activity/v1",
      current: { factors: { cso: { level: "elevated", possibleLevels: ["elevated", "elevated"], observedAt: minutes(15).toISOString(), unknown: 0 } } } });
    expect(await run(minutes(16))).toMatchObject({ sent: 1, errors: 0 });
  });
});

describe("legacy water-quality evaluation uses the run's clock", () => {
  test("the CSO assessment is judged at the injected evaluation time", async () => {
    seed(wqRule());
    await run(minutes(1));
    expect(getCsoActivityAssessment).toHaveBeenCalledWith(expect.any(Array), minutes(1));
  });
});

describe("re-requesting an alert", () => {
  const request = (now) => createColwickAlertSubscription({ email: "User@Example.com", gaugeKey: "4009-level", source: "forecast", direction: "above", threshold: 1.5 }, { now });
  const lastConfirmationToken = () => sendAlertConfirmationEmail.mock.calls.at(-1)[0].confirmationToken;

  test("does not deactivate an active alert, reset its state or break its unsubscribe link", async () => {
    seed(forecastRule({ lastConditionState: "triggered", stateRevision: 4, lastTriggeredAt: T0.toISOString(), lastTransitionId: "t", unsubscribeToken: "existing" }));

    const response = await request(minutes(5));

    expect(subscription(FORECAST_KEY)).toMatchObject({ status: "active", lastConditionState: "triggered", stateRevision: 4, lastTriggeredAt: T0.toISOString(), lastTransitionId: "t", unsubscribeToken: "existing" });
    expect(sendAlertConfirmationEmail).toHaveBeenCalledWith(expect.objectContaining({ unsubscribeToken: "existing" }));
    expect(response.message).toMatch(/not active until you confirm/);
    await expect(confirmColwickAlertSubscription(lastConfirmationToken(), { now: minutes(6) })).resolves.toMatchObject({ status: "already_active" });
    expect(subscription(FORECAST_KEY)).toMatchObject({ status: "active", stateRevision: 4 });
    expect(subscription(FORECAST_KEY).confirmationTokenHash).toBeUndefined();
  });

  test("after unsubscribing with a held delivery, a re-subscription evaluates as a new rule instead of staying stuck", async () => {
    seed(forecastRule({ status: "unsubscribed", lastConditionState: "triggered", pendingTransitionId: "old", pendingSince: T0.toISOString(), lastTransitionId: "old" }));
    fake.docs("alertDeliveries").push({ alertKey: FORECAST_KEY, transitionId: "old", state: "held_for_review", attempts: 5 });

    await request(minutes(5));
    await confirmColwickAlertSubscription(lastConfirmationToken(), { now: minutes(6) });
    forecast(minutes(10), [[1.7, hours(2)]]);
    const result = await run(minutes(16));

    expect(result).toMatchObject({ sent: 1, heldForReview: 0 });
    expect(subscription(FORECAST_KEY).pendingTransitionId).toBeUndefined();
    expect(fake.docs("alertDeliveries").find((doc) => doc.transitionId === "old").state).toBe("held_for_review");
  });

  test("a confirmation link replaced by a later request cannot activate the alert", async () => {
    await request(minutes(1));
    const first = lastConfirmationToken();
    await request(minutes(2));

    await expect(confirmColwickAlertSubscription(first, { now: minutes(3) })).rejects.toMatchObject({ statusCode: 404 });
    await expect(confirmColwickAlertSubscription(lastConfirmationToken(), { now: minutes(3) })).resolves.toMatchObject({ status: "confirmed" });
    await expect(confirmColwickAlertSubscription(lastConfirmationToken(), { now: minutes(4) })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("an unsubscribed alert cannot be re-activated by an old confirmation link", async () => {
    seed(forecastRule({ unsubscribeToken: "bye" }));
    await request(minutes(1));
    await unsubscribeColwickAlertSubscription("bye", { now: minutes(2) });

    await expect(confirmColwickAlertSubscription(lastConfirmationToken(), { now: minutes(3) })).rejects.toMatchObject({ statusCode: 404 });
    expect(subscription(FORECAST_KEY).status).toBe("unsubscribed");
  });
});
