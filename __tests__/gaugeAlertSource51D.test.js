/** @jest-environment node */
// Deterministic regression tests for #51 Slice D: alert-safe legacy/RDP gauge reads, observed-time
// progress, bounded catch-up, hysteresis, source continuity, rollback, retries and the read-only
// RDP shadow. All database, feed, RDP and email interactions are in-memory doubles; nothing is sent.
import { createFakeDb } from "../testUtils/fakeMongo";
import { createGaugeFeeds, eaTime, rdpTime } from "../testUtils/fakeGaugeFeeds";

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
jest.mock("../libs/services/waterQualityService", () => ({ getLatestWaterQualitySnapshot: jest.fn(), getWaterQualityDensitySeries: jest.fn() }));
jest.mock("../libs/waterQualityIndicator", () => ({ getCsoActivityAssessment: jest.fn() }));

const { connectToDatabase } = require("../libs/database");
const { createRdpClient } = require("../libs/rdp/client");
const { sendThresholdAlertEmail, AlertEmailError } = require("../libs/services/alertMailerService");
const { getLatestForecastSnapshot } = require("../libs/services/forecastService");
const { getHppStatusSnapshot } = require("../libs/services/hppStatusService");
const { getLatestWaterQualitySnapshot, getWaterQualityDensitySeries } = require("../libs/services/waterQualityService");
const { getCsoActivityAssessment } = require("../libs/waterQualityIndicator");
const { runColwickAlerts } = require("../libs/services/colwickAlertsService");
const { decideGaugeRule, normalizeObservedAt } = require("../libs/alerts/gaugeAlertDecision");
const { buildGaugeRead } = require("../libs/alerts/gaugeObservations");
const { compareGaugeAlertShadow } = require("../libs/alerts/gaugeAlertShadow");

const T0 = new Date("2026-11-03T12:00:00.000Z");
const at = (minutes) => new Date(T0.getTime() + minutes * 60 * 1000);
const q = (quarter) => at(quarter * 15); // EA quarter-hour observation times
const after = (quarter, minutes = 1) => at(quarter * 15 + minutes); // a cron run shortly after
const COLWICK = "4009-level";
const KEY = "user@example.com|gauge|4009-level|live|above|1.5";
const DELIVERY_INDEX = { alertDeliveries: [{ alertKey: 1, transitionId: 1 }] };

const liveRule = (overrides = {}) => ({ alertKey: KEY, email: "user@example.com", alertType: "gauge", gaugeKey: COLWICK, gaugeName: "Colwick", stationId: 4009, measureType: "level", source: "live", direction: "above", threshold: 1.5, status: "active", lastConditionState: "armed", unsubscribeToken: "secret-unsubscribe-token", confirmedAt: "2026-10-01T00:00:00.000Z", ...overrides });
const hppRule = () => ({ alertKey: "hpp-user@example.com", email: "hpp-user@example.com", alertType: "hpp_status", desiredStatus: "open", status: "active", lastConditionState: "armed", unsubscribeToken: "secret-hpp-token" });
const uncertain = () => new AlertEmailError(502, "Alert email provider did not respond", "uncertain", "timeout");

let fake;
let feeds;
const run = (now, mode) => {
  if (mode) process.env.RDP_GAUGE_ALERTS_SOURCE = mode;
  else delete process.env.RDP_GAUGE_ALERTS_SOURCE;
  return runColwickAlerts({ now });
};
const seed = (...rules) => fake.docs("alertSubscriptions").push(...rules.map((rule) => structuredClone(rule)));
const subscription = (key = KEY) => fake.docs("alertSubscriptions").find((doc) => doc.alertKey === key);
const deliveries = () => fake.docs("alertDeliveries");
const sentCalls = () => sendThresholdAlertEmail.mock.calls.map(([args]) => args);
const legacy = (value, time, gaugeKey = COLWICK) => feeds.add("legacy", gaugeKey, value, time);
const rdp = (value, time, gaugeKey = COLWICK) => feeds.add("rdp", gaugeKey, value, time);
const both = (value, time, gaugeKey = COLWICK) => feeds.addBoth(gaugeKey, value, time);
const transitionId = (time, value, key = KEY) => `${key}:${eaTime(time)}:${value}`;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RDP_GAUGE_ALERTS_SOURCE;
  fake = createFakeDb({ uniqueIndexes: DELIVERY_INDEX });
  feeds = createGaugeFeeds();
  connectToDatabase.mockResolvedValue({ db: fake.db });
  jest.spyOn(global, "fetch").mockImplementation(feeds.fetch);
  createRdpClient.mockReturnValue(feeds.client);
  getLatestForecastSnapshot.mockResolvedValue({ forecast_data: [], metadata: null });
  getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: false, health: { generatedAt: T0.toISOString() } } });
  getLatestWaterQualitySnapshot.mockResolvedValue({ ScrapeTimestamp: T0.toISOString() });
  getWaterQualityDensitySeries.mockResolvedValue([]);
  getCsoActivityAssessment.mockReturnValue({ level: "lower" });
  sendThresholdAlertEmail.mockResolvedValue(undefined);
});

afterAll(() => {
  delete process.env.RDP_GAUGE_ALERTS_SOURCE;
});

describe("source modes", () => {
  test("legacy is the default and never constructs the RDP client", async () => {
    seed(liveRule());
    legacy(1.6, q(0));

    const result = await run(after(0));

    expect(result).toMatchObject({ gaugeSource: "legacy", sent: 1 });
    expect(createRdpClient).not.toHaveBeenCalled();
    expect(feeds.requests.legacy[0].url).toContain("/id/measures/4009-level-stage-i-15_min-mASD/readings?_sorted&since=");
    expect(subscription()).toMatchObject({ lastObservedAt: eaTime(q(0)), lastObservedValue: 1.6, lastObservedSource: "legacy", lastObservedMeasurementId: "ea-colwick-level" });
  });

  test("rdp mode reads only RDP, with no automatic legacy fallback when RDP fails", async () => {
    seed(liveRule());
    legacy(1.6, q(0)); // a perfectly good legacy reading must not be used
    feeds.fail("rdp", COLWICK, { error: "STORAGE_UNAVAILABLE" });

    const result = await run(after(0), "rdp");

    expect(result).toMatchObject({ gaugeSource: "rdp", sent: 0, skipped: 1 });
    expect(result.gaugeSources[COLWICK]).toMatchObject({ source: "rdp", status: "error", error: "STORAGE_UNAVAILABLE" });
    expect(result.sourceFailures).toEqual([`gauge:${COLWICK}`]);
    expect(feeds.requests.legacy).toHaveLength(0);
    expect(subscription().lastObservedAt).toBeUndefined();
  });

  test("an invalid source setting skips only live gauge rules; other alert types still run", async () => {
    seed(liveRule(), hppRule());
    legacy(1.6, q(0));
    getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: true, health: { generatedAt: T0.toISOString() } } });

    const result = await run(after(0), "rdp-please");

    expect(result).toMatchObject({ gaugeSource: "invalid", sent: 1, skipped: 1 });
    expect(result.sourceFailures).toContain("gauge-source-config");
    expect(sentCalls()[0]).toMatchObject({ gaugeName: "HPP opens" });
    expect(feeds.requests.legacy).toHaveLength(0);
    expect(createRdpClient).not.toHaveBeenCalled();
  });

  test("an RDP configuration failure is a per-run source failure, not a fallback", async () => {
    seed(liveRule());
    createRdpClient.mockImplementation(() => { throw Object.assign(new Error("RDP CONFIGURATION_ERROR"), { code: "CONFIGURATION_ERROR" }); });

    const result = await run(after(0), "rdp");

    expect(result.gaugeSources[COLWICK]).toMatchObject({ status: "error", error: "CONFIGURATION_ERROR" });
    expect(result.skipped).toBe(1);
  });

  test("the source is pinned for the whole run even if the setting changes mid-run", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    const block = feeds.block("legacy");

    const pending = run(after(0), "legacy");
    process.env.RDP_GAUGE_ALERTS_SOURCE = "rdp";
    block.release();
    const result = await pending;

    expect(result).toMatchObject({ gaugeSource: "legacy", sent: 1 });
    expect(createRdpClient).not.toHaveBeenCalled();
  });
});

describe("alert-safe reader: identity, quality and freshness", () => {
  test("one failed measurement skips only its own rules; other gauges, forecast and HPP still run", async () => {
    const clifton = liveRule({ alertKey: "c|gauge|4126-level|live|above|2", gaugeKey: "4126-level", stationId: 4126, threshold: 2 });
    const forecastRule = liveRule({ alertKey: "f", source: "forecast", direction: "above", threshold: 1.5 });
    seed(liveRule(), clifton, forecastRule, hppRule());
    feeds.fail("legacy", COLWICK, { status: 503 });
    legacy(2.2, q(0), "4126-level");
    getLatestForecastSnapshot.mockResolvedValue({ metadata: { forecast_time: T0.toISOString() }, forecast_data: [{ forecast_date: at(120).toISOString(), forecast_reading: 1.6 }] });
    getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: true, health: { generatedAt: T0.toISOString() } } });

    const result = await run(after(0));

    expect(result).toMatchObject({ sent: 3, skipped: 1 });
    expect(result.sourceFailures).toEqual([`gauge:${COLWICK}`]);
    expect(result.gaugeSources[COLWICK]).toMatchObject({ status: "error", error: "UPSTREAM_ERROR" });
    expect(subscription()).toMatchObject({ lastConditionState: "armed" });
    expect(subscription().lastObservedAt).toBeUndefined();
    expect(subscription().stateRevision).toBeUndefined();
  });

  test("a reading for a different provider measure invalidates the whole series", async () => {
    seed(liveRule());
    legacy(1.6, q(0), COLWICK);
    feeds.history.legacy[COLWICK][0].measure = "http://environment.data.gov.uk/flood-monitoring/id/measures/4009-level-downstage-i-15_min-mASD";

    const result = await run(after(0));

    expect(result.gaugeSources[COLWICK]).toMatchObject({ status: "error", error: "MEASUREMENT_CONTRACT_ERROR" });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });

  test("untrusted quality makes a reading ineligible; the newest eligible fresh reading is used", async () => {
    seed(liveRule());
    feeds.set("legacy", COLWICK, [[1.4, q(0)], [1.8, q(1), { quality: "Suspect" }]]);

    const result = await run(after(1));

    expect(result.gaugeSources[COLWICK]).toMatchObject({ status: "fresh", newestObservedAt: eaTime(q(0)), rejectedRows: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
    expect(subscription()).toMatchObject({ lastObservedAt: eaTime(q(0)) });
  });

  test("the 30-minute observed-time boundary is inclusive and anything older is stale", async () => {
    seed(liveRule());
    legacy(1.6, q(0));

    const stale = await run(at(30.02));
    expect(stale).toMatchObject({ sent: 0, skipped: 1 });
    expect(stale.gaugeSources[COLWICK]).toMatchObject({ status: "stale" });
    expect(stale.sourceFailures).toEqual([`gauge:${COLWICK}`]);

    const boundary = await run(at(30));
    expect(boundary.sent).toBe(1);
  });

  test("future-dated readings are rejected rather than treated as fresh", async () => {
    seed(liveRule());
    legacy(1.4, q(0));
    legacy(1.9, at(20)); // after the run time

    const result = await run(after(0));

    expect(result.gaugeSources[COLWICK]).toMatchObject({ newestObservedAt: eaTime(q(0)), rejectedRows: 1 });
    expect(sendThresholdAlertEmail).not.toHaveBeenCalled();
  });

  test("RDP quality is the provider's raw text: null and \"Good\" are accepted, anything else is not", () => {
    const now = after(2);
    const read = buildGaugeRead({
      source: "rdp", gaugeKey: COLWICK, measurementId: "ea-colwick-level", now, windowStart: at(-60),
      rows: [
        { observedAt: rdpTime(q(0)), value: 1.4, quality: null },
        { observedAt: rdpTime(q(1)), value: 1.5, quality: "\"Good\"" },
        { observedAt: rdpTime(q(2)), value: 1.6, quality: "\"Estimated\"" },
      ],
    });

    expect(read.observations.map((observation) => observation.value)).toEqual([1.4, 1.5]);
    expect(read.rejectedRows).toBe(1);
    expect(read.observations[1].at).toBe(eaTime(q(1)));
  });

  test("equivalent EA and RDP timestamps normalize to one identity", () => {
    expect(normalizeObservedAt(rdpTime(q(3)))).toBe(eaTime(q(3)));
    expect(normalizeObservedAt(eaTime(q(3)))).toBe(eaTime(q(3)));
  });
});

describe("observed-time progress and bounded catch-up", () => {
  test("repeated 15-minute runs over the same observation neither notify again nor advance progress", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    await run(after(0));
    const revision = subscription().stateRevision;

    const repeat = await run(after(0, 14));
    const stale = await run(after(2));

    expect(repeat).toMatchObject({ sent: 0, rearmed: 0 });
    expect(stale).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ stateRevision: revision, lastObservedAt: eaTime(q(0)), lastConditionState: "triggered" });
  });

  test("a crossing found during catch-up that has already cleared sends nothing, and the rule stays armed", async () => {
    seed(liveRule());
    legacy(1.4, q(0));
    await run(after(0));
    legacy(1.62, q(1));
    legacy(1.45, q(2)); // cleared by the newest observation

    const result = await run(after(2));
    expect(result).toMatchObject({ sent: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "armed", lastObservedAt: eaTime(q(2)) });

    legacy(1.55, q(3));
    expect((await run(after(3))).sent).toBe(1);
    expect(sentCalls()[0]).toMatchObject({ observedValue: 1.55, observedAt: eaTime(q(3)) });
  });

  test("a clear and re-crossing during catch-up notifies once with the newest observation when still met", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    await run(after(0));
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    legacy(1.4, q(1)); // clears (<= 1.47)
    legacy(1.58, q(2));
    legacy(1.62, q(3));

    const result = await run(after(3)); // the runs after q(1) and q(2) were missed

    expect(result.sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
    expect(sentCalls()[1]).toMatchObject({ observedValue: 1.62, observedAt: eaTime(q(3)) });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastTransitionId: transitionId(q(3), 1.62) });
  });

  test("hysteresis above: readings inside the margin never rearm or resend, during live or catch-up runs", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    await run(after(0));
    legacy(1.48, q(1)); // inside the 0.03 m margin
    legacy(1.52, q(2));
    await run(after(2));
    legacy(1.49, q(3));
    await run(after(3));

    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedAt: eaTime(q(3)) });
  });

  test("hysteresis below for flow uses the 1 m3/s margin", async () => {
    const flowKey = "f@example.com|gauge|4007-flow|live|below|30";
    seed(liveRule({ alertKey: flowKey, gaugeKey: "4007-flow", stationId: 4007, measureType: "flow", direction: "below", threshold: 30 }));
    const flow = (value, quarter) => { legacy(value, q(quarter), "4007-flow"); return run(after(quarter)); };

    expect((await flow(29.5, 0)).sent).toBe(1);
    expect((await flow(30.5, 1)).rearmed).toBe(0); // inside the margin
    expect((await flow(29, 2)).sent).toBe(0);
    expect((await flow(31, 3)).rearmed).toBe(1);
    expect((await flow(29.9, 4)).sent).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(2);
  });

  test("legitimate provider gaps are tolerated inside the bounded window", async () => {
    seed(liveRule());
    legacy(1.4, q(0));
    await run(after(0));
    legacy(1.6, q(12)); // three hours without readings

    expect((await run(after(12))).sent).toBe(1);
  });

  test("history over the row budget holds the rule rather than reading part of it", async () => {
    seed(liveRule());
    for (let minute = 0; minute < 200 * 5; minute += 5) legacy(1.6, at(minute - 1000));

    const result = await run(after(0));

    expect(result).toMatchObject({ sent: 0, gaugeHeld: 1, gaugeHoldReasons: { catchup_budget_exceeded: 1 } });
    expect(subscription().gaugeHold).toMatchObject({ reason: "catchup_budget_exceeded" });
  });

  test("conflicting values at one timestamp hold the rule; it resumes once the source is consistent", async () => {
    seed(liveRule());
    legacy(1.4, q(0));
    await run(after(0));
    const revision = subscription().stateRevision;
    legacy(1.6, q(1));
    legacy(1.3, q(1));

    const held = await run(after(1));
    expect(held).toMatchObject({ sent: 0, gaugeHeld: 1, gaugeHoldReasons: { conflicting_history: 1 } });
    expect(subscription()).toMatchObject({ stateRevision: revision, lastObservedAt: eaTime(q(0)), gaugeHold: { reason: "conflicting_history", source: "legacy" } });

    feeds.history.legacy[COLWICK].pop();
    expect((await run(after(1, 5))).sent).toBe(1);
    expect(subscription().gaugeHold).toBeUndefined();
  });

  test("a revised value at the processed timestamp holds the rule instead of recreating a transition", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    await run(after(0));
    feeds.history.legacy[COLWICK][0].value = 1.4; // the processed reading was revised
    legacy(1.4, q(1));

    const result = await run(after(1));

    expect(result).toMatchObject({ rearmed: 0, sent: 0, gaugeHoldReasons: { continuity_conflict: 1 } });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedAt: eaTime(q(0)) });
  });

  test("a triggered rule whose progress is older than the window is held; an armed one depends only on the newest reading", async () => {
    const armedKey = "armed@example.com|gauge|4009-level|live|above|1.7";
    seed(liveRule(), liveRule({ alertKey: armedKey, email: "armed@example.com", threshold: 1.7 }));
    legacy(1.6, q(0));
    await run(after(0)); // KEY triggers, armedKey enrols armed
    legacy(1.72, q(100)); // 25 hours later; nothing in between

    const result = await run(after(100));

    expect(result.gaugeHoldReasons).toEqual({ catchup_window_exceeded: 1 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedAt: eaTime(q(0)), gaugeHold: { reason: "catchup_window_exceeded" } });
    expect(subscription(armedKey)).toMatchObject({ lastConditionState: "triggered" });
    expect(sentCalls().map((call) => call.observedValue)).toEqual([1.6, 1.72]);
  });

  test("operator re-baselining of a held rule records new progress without a transition", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    await run(after(0));
    legacy(1.62, q(100));
    await run(after(100));
    expect(subscription().gaugeHold).toBeTruthy();

    // Documented reconciliation: remove the progress fields (and label) after review.
    ["lastObservedAt", "lastObservedValue", "lastObservedSource", "lastObservedMeasurementId", "lastObservedState", "lastObservedTransitionId", "gaugeHold"].forEach((field) => delete subscription()[field]);
    const result = await run(after(100, 5));

    expect(result).toMatchObject({ enrolled: 1, sent: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedAt: eaTime(q(100)) });
    expect(subscription().gaugeHold).toBeUndefined();
  });
});

describe("existing subscriptions without progress", () => {
  const existing = { lastEvaluatedAt: "2026-11-03T11:46:00.000Z", lastTriggeredAt: "2026-10-30T10:00:00.000Z", lastTransitionId: "old-transition", stateRevision: 4 };

  test("on RDP, an existing armed rule is enrolled without a crossing even if the newest reading meets it", async () => {
    seed(liveRule({ ...existing, lastConditionState: "armed" }));
    rdp(1.6, q(0));

    const first = await run(after(0), "rdp");
    expect(first).toMatchObject({ enrolled: 1, sent: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "armed", lastObservedSource: "rdp", lastTriggeredAt: existing.lastTriggeredAt, lastTransitionId: "old-transition", stateRevision: 5 });

    rdp(1.61, q(1));
    expect((await run(after(1), "rdp")).sent).toBe(1);
  });

  test("on RDP, an existing triggered rule is not rearmed by its first reading", async () => {
    seed(liveRule({ ...existing, lastConditionState: "triggered" }));
    rdp(1.3, q(0));

    expect(await run(after(0), "rdp")).toMatchObject({ enrolled: 1, rearmed: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });

    rdp(1.3, q(1)); // later evidence on the same source may rearm normally
    expect((await run(after(1), "rdp")).rearmed).toBe(1);
  });

  test("on legacy, existing rules keep exactly the legacy evaluator's newest-reading behaviour", async () => {
    seed(liveRule({ ...existing, lastConditionState: "armed" }));
    legacy(1.6, q(0));

    expect((await run(after(0))).sent).toBe(1);
  });

  test("a marker detached by a writer that does not maintain progress is reconciled, not replayed", async () => {
    seed(liveRule());
    both(1.4, q(0));
    await run(after(0));
    // Pre-Slice-D code (e.g. after a code rollback) triggers and emails without touching the marker.
    Object.assign(subscription(), { lastConditionState: "triggered", lastTransitionId: "rollback-transition", stateRevision: subscription().stateRevision + 1 });
    both(1.6, q(1));

    const result = await run(after(1), "rdp");

    expect(result).toMatchObject({ enrolled: 1, sent: 0 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedSource: "rdp", lastObservedTransitionId: "rollback-transition" });
  });
});

describe("source switch and rollback", () => {
  test("legacy to RDP with matching overlap continues without a switch transition, then notifies once", async () => {
    seed(liveRule());
    both(1.4, q(0));
    await run(after(0), "legacy");
    both(1.45, q(1));

    const switched = await run(after(1), "rdp");
    expect(switched).toMatchObject({ sent: 0, rearmed: 0, gaugeHeld: 0 });
    expect(subscription()).toMatchObject({ lastObservedSource: "rdp", lastObservedAt: eaTime(q(1)) });

    both(1.6, q(2));
    expect((await run(after(2), "rdp")).sent).toBe(1);
    expect(subscription().lastTransitionId).toBe(transitionId(q(2), 1.6));
  });

  test("RDP disagreeing with the processed legacy value holds the rule until the value is reconciled", async () => {
    seed(liveRule());
    legacy(1.4, q(0));
    await run(after(0), "legacy");
    rdp(1.43, q(0));
    rdp(1.6, q(1));

    const held = await run(after(1), "rdp");
    expect(held).toMatchObject({ sent: 0, gaugeHoldReasons: { continuity_conflict: 1 } });
    expect(subscription()).toMatchObject({ lastObservedSource: "legacy", gaugeHold: { reason: "continuity_conflict", source: "rdp" } });

    feeds.history.rdp[COLWICK][0].value = 1.4; // corrected upstream revision
    expect((await run(after(1, 5), "rdp")).sent).toBe(1);
  });

  test("a lagging new source holds the rule until it has the processed observation", async () => {
    seed(liveRule());
    both(1.4, q(0));
    legacy(1.45, q(1));
    await run(after(1), "legacy");

    const held = await run(after(1, 3), "rdp");
    expect(held.gaugeHoldReasons).toEqual({ continuity_unproven: 1 });

    rdp(1.45, q(1));
    both(1.6, q(2));
    expect((await run(after(2), "rdp")).sent).toBe(1);
  });

  test("RDP to legacy rollback: an older legacy value cannot rearm, and unrelated alerts still run", async () => {
    seed(liveRule(), hppRule());
    legacy(1.3, q(-1)); // legacy lags RDP
    rdp(1.6, q(0));
    await run(after(0), "rdp");
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedSource: "rdp" });
    getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: true, health: { generatedAt: T0.toISOString() } } });

    const rollback = await run(after(0, 5), "legacy");

    expect(rollback).toMatchObject({ rearmed: 0, sent: 1, gaugeHoldReasons: { continuity_unproven: 1 } });
    expect(sentCalls()[1]).toMatchObject({ gaugeName: "HPP opens" });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered", lastObservedSource: "rdp" });
  });

  test("RDP to legacy rollback: a newer but inconsistent legacy series is held, not trusted", async () => {
    seed(liveRule());
    rdp(1.6, q(0));
    await run(after(0), "rdp");
    legacy(1.2, q(0));
    legacy(1.2, q(1));

    const rollback = await run(after(1), "legacy");

    expect(rollback).toMatchObject({ rearmed: 0, sent: 0, gaugeHoldReasons: { continuity_conflict: 1 } });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });

  test("overlapping old and new deployments with different sources cannot both write a transition", async () => {
    seed(liveRule());
    both(1.4, q(0));
    await run(after(0));
    legacy(1.6, q(1));
    rdp(1.61, q(1)); // the two sources even disagree about the crossing value

    const [legacyRun, rdpRun] = await Promise.all([run(after(1), "legacy"), run(after(1), "rdp")]);

    expect(legacyRun.sent + rdpRun.sent).toBe(1);
    expect(legacyRun.suppressed + rdpRun.suppressed).toBe(1);
    expect(deliveries()).toHaveLength(1);
    const winner = subscription().lastObservedSource;
    const loser = winner === "legacy" ? "rdp" : "legacy";

    // The losing deployment's next run must not accept a transition the winner did not see.
    const next = await run(after(1, 5), loser);
    expect(next).toMatchObject({ sent: 0, gaugeHoldReasons: { continuity_conflict: 1 } });
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
  });

  test("equivalent EA and RDP observations keep one delivery identity across a switch", async () => {
    seed(liveRule());
    both(1.6, q(0));
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(after(0), "legacy");
    both(1.62, q(1));

    const result = await run(after(1), "rdp");

    expect(result.sent).toBe(1);
    expect(deliveries()).toHaveLength(1);
    expect(deliveries()[0]).toMatchObject({ transitionId: transitionId(q(0), 1.6), state: "sent", attempts: 2 });
    expect(new Set(sentCalls().map((call) => call.idempotencyKey)).size).toBe(1);
  });
});

describe("delivery retries for live gauge rules", () => {
  test("an uncertain send is not retried once the newest fresh observation no longer meets the rule", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(after(0));
    legacy(1.4, q(1));

    const cleared = await run(after(1));
    expect(cleared).toMatchObject({ deferred: 1, sent: 0 });
    const stale = await run(after(4)); // no fresh reading at all
    expect(stale).toMatchObject({ deferred: 1 });
    const expired = await run(at(24 * 60));

    expect(expired.heldForReview).toBe(1);
    expect(sendThresholdAlertEmail).toHaveBeenCalledTimes(1);
    expect(deliveries()[0]).toMatchObject({ state: "held_for_review", heldReason: "idempotency_window_expired", attempts: 1 });
    expect(subscription()).toMatchObject({ lastConditionState: "triggered" });
  });

  test("an uncertain send is retried with the same key while the condition still holds", async () => {
    seed(liveRule());
    legacy(1.6, q(0));
    sendThresholdAlertEmail.mockRejectedValueOnce(uncertain());
    await run(after(0));
    legacy(1.55, q(1));

    expect((await run(after(1))).sent).toBe(1);
    expect(new Set(sentCalls().map((call) => call.idempotencyKey)).size).toBe(1);
    expect(sentCalls()[1].observedValue).toBe(1.6); // the original immutable payload
  });
});

describe("read-only RDP shadow", () => {
  const writes = (db) => db.calls
    .filter((call) => ["insertOne", "updateOne", "updateMany"].includes(call.op))
    .map((call) => JSON.stringify(call).replace(/"runId":"[^"]+"|"reconciledByRunId":"[^"]+"|"durationMs":\d+|"completedAt":"[^"]+"|"gaugeSource":"\w+"/g, ""));

  function scenario() {
    seed(liveRule({ lastEvaluatedAt: "2026-11-03T11:30:00.000Z" }), hppRule());
    getHppStatusSnapshot.mockResolvedValue({ data: { currentStatus: true, health: { generatedAt: T0.toISOString() } } });
    both(1.4, q(0));
    legacy(1.45, q(1));
    rdp(1.62, q(1)); // RDP alone would cross
  }

  async function runScenario(mode) {
    fake = createFakeDb({ uniqueIndexes: DELIVERY_INDEX });
    connectToDatabase.mockResolvedValue({ db: fake.db });
    feeds = createGaugeFeeds();
    global.fetch.mockImplementation(feeds.fetch);
    createRdpClient.mockReturnValue(feeds.client);
    sendThresholdAlertEmail.mockClear();
    scenario();
    await run(after(0), mode); // establishes legacy progress in both cases
    const before = fake.calls.length;
    const result = await run(after(1), mode);
    return { result, writes: writes({ calls: fake.calls.slice(before) }), sends: sentCalls(), docs: structuredClone(fake.docs("alertSubscriptions")), deliveries: structuredClone(fake.docs("alertDeliveries")) };
  }

  test("shadow performs exactly the legacy writes and sends, whatever RDP would decide", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const legacyRun = await runScenario("legacy");
    const shadowRun = await runScenario("shadow");

    expect(shadowRun.writes).toEqual(legacyRun.writes);
    expect(shadowRun.sends).toEqual(legacyRun.sends);
    expect(shadowRun.sends.map((call) => call.gaugeName)).toEqual(["HPP opens"]);
    expect(shadowRun.docs.map(({ updatedAt, lastEvaluatedAt, ...doc }) => doc)).toEqual(legacyRun.docs.map(({ updatedAt, lastEvaluatedAt, ...doc }) => doc));
    expect(shadowRun.deliveries.map((doc) => doc.transitionId)).toEqual(legacyRun.deliveries.map((doc) => doc.transitionId));
    expect(fake.docs("alertRuns").every((doc) => doc.shadow === undefined)).toBe(true);
    expect(shadowRun.result.shadow).toMatchObject({ status: "completed", compared: 1, disagreed: 1 });

    // The second (comparison) run's report; the first run only established progress.
    const line = log.mock.calls.map(([message]) => String(message)).findLast((message) => message.includes("RDP gauge alert shadow comparison"));
    expect(line).toBeTruthy();
    const report = JSON.parse(line.slice(line.indexOf("{")));
    expect(report.decisions.pairs).toEqual({ "advance -> trigger": 1 });
    expect(report.gauges[COLWICK].comparison).toMatchObject({ matchedTimestamps: 2, valueMismatches: 1, newestLagSeconds: 0 });
    expect(line).not.toMatch(/@example\.com|secret-|user@/);
    log.mockRestore();
  });

  test("a failing or hanging RDP shadow read never blocks or changes legacy evaluation", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    seed(liveRule());
    legacy(1.6, q(0));
    feeds.fail("rdp", COLWICK, { error: "ARCHIVE_INTEGRITY" });

    const result = await run(after(0), "shadow");

    expect(result).toMatchObject({ gaugeSource: "shadow", sent: 1 });
    expect(subscription()).toMatchObject({ lastObservedSource: "legacy" });
    const report = JSON.parse(log.mock.calls.map(([message]) => String(message)).find((message) => message.includes("shadow comparison")).replace(/^[^{]*/, ""));
    expect(report.gauges[COLWICK].rdp).toMatchObject({ status: "error", error: "ARCHIVE_INTEGRITY" });
    log.mockRestore();
  });

  test("the comparison is a pure function of frozen inputs", () => {
    const deepFreeze = (value) => { if (value && typeof value === "object") { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };
    const now = after(1);
    const read = (source, values) => buildGaugeRead({ source, gaugeKey: COLWICK, measurementId: "ea-colwick-level", now, windowStart: at(-60), rows: values.map(([value, time]) => ({ observedAt: source === "rdp" ? rdpTime(time) : eaTime(time), value })) });
    const rules = deepFreeze([liveRule({ lastEvaluatedAt: "x", lastObservedAt: eaTime(q(0)), lastObservedValue: 1.4, lastObservedSource: "legacy", lastObservedMeasurementId: "ea-colwick-level", lastObservedState: "armed", lastObservedTransitionId: null })]);
    const legacyReads = new Map([[COLWICK, deepFreeze(read("legacy", [[1.4, q(0)], [1.45, q(1)]]))]]);
    const rdpReads = new Map([[COLWICK, deepFreeze(read("rdp", [[1.4, q(0)]]))]]);

    const report = compareGaugeAlertShadow({ rules, legacy: legacyReads, rdp: rdpReads, now });

    expect(report.gauges[COLWICK].comparison).toMatchObject({ matchedTimestamps: 1, legacyOnly: 0, newestLagSeconds: 900 });
    expect(report.decisions).toMatchObject({ compared: 1, disagreed: 1, pairs: { "advance -> unchanged": 1 } });
  });
});

describe("pure decisions", () => {
  const read = (values, now, source = "legacy") => buildGaugeRead({ source, gaugeKey: COLWICK, measurementId: "ea-colwick-level", now, windowStart: new Date(now.getTime() - 24 * 3600 * 1000), rows: values.map(([value, time]) => ({ observedAt: eaTime(time), value })) });
  const marked = (overrides = {}) => liveRule({ lastEvaluatedAt: "x", lastObservedAt: eaTime(q(0)), lastObservedValue: 1.4, lastObservedSource: "legacy", lastObservedMeasurementId: "ea-colwick-level", lastObservedState: "armed", lastObservedTransitionId: null, ...overrides });

  test("older or replayed observations never create a transition", () => {
    const now = after(1);
    expect(decideGaugeRule(marked(), read([[1.4, q(0)]], now), now)).toEqual({ kind: "unchanged" });
    expect(decideGaugeRule(marked({ lastObservedAt: eaTime(q(1)), lastObservedValue: 1.45 }), read([[1.4, q(0)], [1.45, q(1)]], now), now)).toEqual({ kind: "unchanged" });
  });

  test("a changed canonical measurement for the rule is held", () => {
    const now = after(1);
    expect(decideGaugeRule(marked({ lastObservedMeasurementId: "ea-other-level" }), read([[1.4, q(0)], [1.6, q(1)]], now), now)).toEqual({ kind: "hold", reason: "measurement_changed" });
  });

  test("a processed observation missing from the same source inside the window is held", () => {
    const now = after(2);
    expect(decideGaugeRule(marked(), read([[1.6, q(1)], [1.6, q(2)]], now), now)).toEqual({ kind: "hold", reason: "marker_missing" });
  });
});
