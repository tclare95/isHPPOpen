/** @jest-environment node */
// Water-quality ("CSO risk") alerts under RDP_WQ_ASSESSMENT: source pinning, no artificial notifications on a switch in
// either direction, conservative handling of unavailable evidence. In-memory doubles only; nothing is sent.
import { createFakeDb } from "../testUtils/fakeMongo";

jest.mock("server-only", () => ({}));
jest.mock("../libs/database");
jest.mock("../libs/services/alertMailerService", () => ({
  ...jest.requireActual("../libs/services/alertMailerService"),
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
const { sendThresholdAlertEmail } = require("../libs/services/alertMailerService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const { getHppStatusSnapshot } = require("../libs/services/hppStatusService");
const { getLatestWaterQualitySummaryHealth, getWaterQualityDensitySeries } = require("../libs/services/waterQualityService");
const { getCsoActivityAssessment } = require("../libs/waterQualityIndicator");
const { getRdpAlertAssessment } = require("../libs/services/waterQualityAssessmentService");
const { runColwickAlerts } = require("../libs/services/colwickAlertsService");

const T0 = new Date("2026-11-16T12:00:00.000Z");
const minutes = (count) => new Date(T0.getTime() + count * 60000);
const KEY = "user@example.com|water_quality|amber|||";
const V1 = "hpp-upstream-activity/v1";
const rule = (overrides = {}) => ({ alertKey: KEY, email: "user@example.com", alertType: "water_quality", riskLevel: "amber", gaugeName: "Water quality", status: "active",
  lastConditionState: "armed", lastEvaluatedAt: "2026-11-16T11:45:00.000Z", unsubscribeToken: "u", confirmedAt: "2026-10-01T00:00:00.000Z", ...overrides });

let fake;
const seed = (...rules) => fake.docs("alertSubscriptions").push(...rules.map((entry) => JSON.parse(JSON.stringify(entry))));
const subscription = () => fake.docs("alertSubscriptions").find((doc) => doc.alertKey === KEY);
const rdpLevel = (lowest, highest = lowest, at = T0) => getRdpAlertAssessment.mockResolvedValue({ version: V1,
  current: { factors: { cso: { level: lowest, possibleLevels: [lowest, highest], observedAt: at.toISOString(), unknown: 0 } } } });
const legacyLevel = (level) => getCsoActivityAssessment.mockReturnValue({ level });
const mode = (value) => { if (value === undefined) delete process.env.RDP_WQ_ASSESSMENT; else process.env.RDP_WQ_ASSESSMENT = value; };

beforeEach(() => {
  jest.clearAllMocks();
  fake = createFakeDb({ uniqueIndexes: { alertDeliveries: [{ alertKey: 1, transitionId: 1 }] } });
  connectToDatabase.mockResolvedValue({ db: fake.db });
  mode(undefined);
  getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });
  getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: false, health: { generatedAt: T0.toISOString() } } });
  getLatestWaterQualitySummaryHealth.mockResolvedValue({ ScrapeTimestamp: T0.toISOString() });
  getWaterQualityDensitySeries.mockResolvedValue([]);
  legacyLevel("lower");
  rdpLevel("lower");
  sendThresholdAlertEmail.mockResolvedValue(undefined);
});
afterAll(() => mode(undefined));

describe("legacy mode (default) is unchanged", () => {
  test("reads the legacy density only and triggers as before", async () => {
    seed(rule());
    legacyLevel("elevated");
    const result = await runColwickAlerts({ now: minutes(1) });
    expect(getRdpAlertAssessment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ sent: 1, waterQualitySource: "legacy" });
    expect(subscription().wqAssessment).toBeUndefined();
  });
});

describe("rdp mode", () => {
  beforeEach(() => mode("rdp"));

  test("never reads Mongo waterQuality and, at the switch, sends nothing even when the new assessment already meets the rule", async () => {
    seed(rule());
    rdpLevel("elevated");
    const first = await runColwickAlerts({ now: minutes(1) });
    expect(getLatestWaterQualitySummaryHealth).not.toHaveBeenCalled();
    expect(getWaterQualityDensitySeries).not.toHaveBeenCalled();
    expect(first).toMatchObject({ sent: 0, enrolled: 1, waterQualitySource: "rdp", waterQuality: { version: V1, level: "elevated" } });
    expect(first.sourceFailures).toEqual([]);
    // Only evaluation-state fields change; the subscriber's choices are untouched.
    expect(subscription()).toMatchObject({ riskLevel: "amber", email: "user@example.com", status: "active", lastConditionState: "armed",
      wqAssessment: { version: V1, state: "armed", suppressUntilClear: true, lowest: "amber" } });

    // Still elevated: held.
    expect(await runColwickAlerts({ now: minutes(16) })).toMatchObject({ sent: 0, enrolled: 0 });
    expect(subscription().wqAssessment.suppressUntilClear).toBe(true);
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    // Clears once, then a real rise notifies.
    rdpLevel("lower", "lower", minutes(31));
    await runColwickAlerts({ now: minutes(31) });
    expect(subscription().wqAssessment.suppressUntilClear).toBe(false);
    rdpLevel("elevated", "elevated", minutes(46));
    expect(await runColwickAlerts({ now: minutes(46) })).toMatchObject({ sent: 1 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", wqAssessment: { state: "triggered", version: V1 } });
    expect(subscription().wqAssessment.transitionId).toBe(subscription().lastTransitionId);
  });

  test("unavailable or undetermined evidence neither triggers nor re-arms", async () => {
    seed(rule({ lastConditionState: "triggered", lastTransitionId: "t", wqAssessment: { version: V1, state: "triggered", transitionId: "t", suppressUntilClear: false } }));
    getRdpAlertAssessment.mockResolvedValue({ version: V1, current: { factors: { cso: { level: "unavailable", unavailableReason: "insufficient_evidence" } } } });
    const unavailable = await runColwickAlerts({ now: minutes(1) });
    expect(unavailable).toMatchObject({ sent: 0, rearmed: 0, skipped: 1 });
    expect(unavailable.sourceFailures).toContain("wq-assessment");
    rdpLevel("lower", "elevated");
    expect(await runColwickAlerts({ now: minutes(16) })).toMatchObject({ rearmed: 0 });
    rdpLevel("lower");
    expect(await runColwickAlerts({ now: minutes(31) })).toMatchObject({ rearmed: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });

  test("a failed RDP read is a source failure, never a fallback to legacy density", async () => {
    seed(rule());
    getRdpAlertAssessment.mockRejectedValue(new Error("boom"));
    legacyLevel("high");
    const result = await runColwickAlerts({ now: minutes(1) });
    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(result.sourceFailures).toContain("wq-assessment");
    expect(getCsoActivityAssessment).not.toHaveBeenCalled();
  });

  test("no water-quality rules: the RDP assessment is not read at all", async () => {
    await runColwickAlerts({ now: minutes(1) });
    expect(getRdpAlertAssessment).not.toHaveBeenCalled();
  });
});

describe("rolling back to legacy is also silent", () => {
  test("a rule last decided by the RDP assessment re-enrols on legacy before legacy can notify", async () => {
    seed(rule({ wqAssessment: { version: V1, state: "armed", transitionId: null, suppressUntilClear: false } }));
    legacyLevel("elevated");
    const result = await runColwickAlerts({ now: minutes(1) });
    expect(result).toMatchObject({ sent: 0, enrolled: 1, waterQualitySource: "legacy" });
    expect(subscription().wqAssessment).toMatchObject({ version: "sewage-map-density/2026-08-31", suppressUntilClear: true });
    legacyLevel("lower");
    await runColwickAlerts({ now: minutes(16) });
    legacyLevel("elevated");
    expect(await runColwickAlerts({ now: minutes(31) })).toMatchObject({ sent: 1 });
  });
});

describe("shadow mode", () => {
  test("legacy decides; the RDP decisions are reported and never written", async () => {
    mode("shadow");
    seed(rule());
    rdpLevel("high");
    legacyLevel("lower");
    const result = await runColwickAlerts({ now: minutes(1) });
    expect(result).toMatchObject({ sent: 0, waterQualitySource: "shadow", waterQualityShadow: { rdp: { level: "high" }, decisions: { "enrol:assessment_changed": 1 } } });
    expect(subscription().wqAssessment).toBeUndefined();
  });
});

test("an invalid mode skips water-quality rules and reports it", async () => {
  mode("sewage");
  seed(rule());
  legacyLevel("high");
  const result = await runColwickAlerts({ now: minutes(1) });
  expect(result).toMatchObject({ sent: 0, skipped: 1, waterQualitySource: "invalid" });
  expect(result.sourceFailures).toContain("wq-assessment-config");
});
