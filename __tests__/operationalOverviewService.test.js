/** @jest-environment node */
jest.mock("../libs/database", () => ({ connectToDatabase: jest.fn() }));
const { connectToDatabase } = require("../libs/database");
const {
  ALERT_RUN_MAX_AGE_MS,
  RECENT_RUN_LIMIT,
  buildOperationalOverview,
  getOperationalOverview,
  safeCategory,
} = require("../libs/services/operationalOverviewService");
const { buildNeedsAttention, classifySourceCheck } = require("../libs/operationalOverview");

const NOW = new Date("2026-11-18T12:00:00.000Z");
const minutesAgo = (minutes) => new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
const ok = (value) => ({ status: "fulfilled", value });
const failed = () => ({ status: "rejected", reason: new Error("connection reset by mongodb+srv://user:secret@host") });
const LEGACY_ENV = Object.freeze({});
const SHADOW_ENV = Object.freeze({ HPP_STATUS_SOURCE: "shadow" });

const freshHealth = (overrides = {}) => ({ runs: 10, lastRunAt: minutesAgo(5), lastAction: "none", lastReason: "unchanged", lastObservedAt: minutesAgo(12), holdSince: null, consecutiveHolds: 0, lastSourceError: null, ...overrides });
const hppState = (health = freshHealth()) => ({ _id: "hpp-colwick", open: true, changedAt: minutesAgo(600), health });
const run = (overrides = {}) => ({
  status: "success", startedAt: minutesAgo(5), completedAt: minutesAgo(4), durationMs: 2100, scanned: 7,
  sent: 0, failed: 0, uncertain: 0, heldForReview: 0, errors: 0, gaugeHeld: 0,
  sourceFailures: [], errorCategories: {}, deliveryIndex: "present",
  outstandingDeliveries: { staleClaims: 0, uncertain: 0, heldForReview: 0 },
  gaugeSource: "rdp", gaugeSources: { "4009-level": { source: "rdp", status: "fresh", newestObservedAt: minutesAgo(15) } },
  waterQualitySource: "legacy",
  ...overrides,
});
const summary = (minutes = 10) => ({ Id: "summary", ScrapeTimestamp: minutesAgo(minutes), health: { state: minutes > 30 ? "stale" : "fresh", generatedAt: minutesAgo(minutes) } });

const evidence = (overrides = {}) => ({
  control: ok(null),
  shadowState: ok(hppState()),
  authoritativeState: ok(null),
  latestRecord: ok({ timestamp: minutesAgo(600), value: true }),
  runs: ok([run(), run({ startedAt: minutesAgo(20) })]),
  summary: ok(summary()),
  ...overrides,
});

const build = (overrides, env = SHADOW_ENV) => buildOperationalOverview(evidence(overrides), { env, now: NOW });
const byKey = (components, key) => components.find((item) => item.key === key);

describe("operational overview: all healthy", () => {
  test("every component reports healthy, with evidence timestamps and diagnostic links", () => {
    const components = build();
    expect(components.map(({ key, state }) => [key, state])).toEqual([
      ["hppEvaluation", "healthy"],
      ["alertEvaluation", "healthy"],
      ["alertDelivery", "healthy"],
      ["alertGaugeInputs", "healthy"],
      ["alertForecastInput", "healthy"],
      ["waterQuality", "healthy"],
    ]);
    for (const item of components) {
      expect(item.attention).toBe(false);
      expect(item.evidenceAt).toEqual(expect.any(String));
      expect(item.links.length).toBeGreaterThan(0);
    }
    expect(buildNeedsAttention(components)).toEqual([]);
  });
});

describe("HPP status evaluation", () => {
  test("legacy mode is not checked and not flagged, but shows the public record", () => {
    const hpp = byKey(build({}, LEGACY_ENV), "hppEvaluation");
    expect(hpp).toMatchObject({ state: "unknown", attention: false });
    expect(hpp.summary).toMatch(/not checked/i);
    expect(hpp.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Public status written by", value: "legacy scraper" })]));
  });

  test("a writer control naming the app while evaluation is off is degraded", () => {
    const hpp = byKey(build({ control: ok({ owner: "app" }) }, LEGACY_ENV), "hppEvaluation");
    expect(hpp).toMatchObject({ state: "degraded", attention: true });
    expect(hpp.reasons[0].category).toBe("writer_mismatch");
  });

  test("never run is unknown, never healthy", () => {
    const hpp = byKey(build({ shadowState: ok(null) }), "hppEvaluation");
    expect(hpp).toMatchObject({ state: "unknown", attention: true });
    expect(hpp.reasons[0].category).toBe("never_run");
  });

  test("a stale last run is degraded", () => {
    const hpp = byKey(build({ shadowState: ok(hppState(freshHealth({ lastRunAt: minutesAgo(90) }))) }), "hppEvaluation");
    expect(hpp.state).toBe("degraded");
    expect(hpp.reasons.map((item) => item.category)).toEqual(["stale_run"]);
  });

  test("a hold shows its reason and whether it needs review", () => {
    const health = freshHealth({ lastAction: "hold", lastReason: "orphaned_transition", holdSince: minutesAgo(60), holdReason: "orphaned_transition", consecutiveHolds: 4, lastSourceError: "RDP_TIMEOUT" });
    const hpp = byKey(build({ shadowState: ok(hppState(health)) }), "hppEvaluation");
    expect(hpp.state).toBe("degraded");
    expect(hpp.reasons.map((item) => item.category)).toEqual(["hold:orphaned_transition", "source_error:RDP_TIMEOUT"]);
    expect(hpp.reasons[0].message).toMatch(/needs review/);
  });

  test("authoritative mode reads the authoritative state when the control names the app", () => {
    const components = build({ control: ok({ owner: "app" }), shadowState: ok(null), authoritativeState: ok(hppState()) }, { HPP_STATUS_SOURCE: "authoritative" });
    expect(byKey(components, "hppEvaluation")).toMatchObject({ state: "healthy" });
  });

  test("an invalid mode is degraded", () => {
    expect(byKey(build({}, { HPP_STATUS_SOURCE: "sometimes" }), "hppEvaluation").reasons[0].category).toBe("invalid_config");
  });

  test("a failed state read is unknown, and other components are unaffected (partial result)", () => {
    const components = build({ shadowState: failed() });
    expect(byKey(components, "hppEvaluation")).toMatchObject({ state: "unknown", attention: true });
    expect(byKey(components, "hppEvaluation").reasons[0].category).toBe("evidence_read_failed");
    expect(byKey(components, "alertEvaluation").state).toBe("healthy");
  });
});

describe("alert evaluation", () => {
  test("never run is unknown", () => {
    const components = build({ runs: ok([]) });
    for (const key of ["alertEvaluation", "alertDelivery", "alertGaugeInputs", "alertForecastInput"]) {
      expect(byKey(components, key)).toMatchObject({ state: "unknown", attention: true });
    }
  });

  test("a stale latest run is degraded and its recorded inputs become not checked", () => {
    const stale = minutesAgo(ALERT_RUN_MAX_AGE_MS / 60000 + 15);
    const components = build({ runs: ok([run({ startedAt: stale })]) });
    expect(byKey(components, "alertEvaluation").reasons[0].category).toBe("stale_run");
    expect(byKey(components, "alertEvaluation").state).toBe("degraded");
    expect(byKey(components, "alertGaugeInputs")).toMatchObject({ state: "unknown" });
    expect(byKey(components, "alertDelivery").reasons[0].category).toBe("evidence_stale");
  });

  test("a failed run is unavailable with its sanitized category, and the last success is still found", () => {
    const components = build({ runs: ok([run({ status: "failed", errorCategory: "MongoNetworkError", sent: undefined }), run({ startedAt: minutesAgo(20) })]) });
    const alerts = byKey(components, "alertEvaluation");
    expect(alerts.state).toBe("unavailable");
    expect(alerts.reasons[0].category).toBe("run_failed:MongoNetworkError");
    expect(alerts.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Last successful run (of last 2)", value: minutesAgo(20) })]));
    // Delivery evidence falls back to the last run that evaluated rules.
    expect(byKey(components, "alertDelivery").state).toBe("healthy");
  });

  test("an in-progress run uses the previous finished run; an abandoned one is interrupted", () => {
    const inProgress = build({ runs: ok([run({ status: "running", startedAt: minutesAgo(1) }), run({ startedAt: minutesAgo(16) })]) });
    expect(byKey(inProgress, "alertEvaluation").state).toBe("healthy");
    const abandoned = build({ runs: ok([run({ status: "running", startedAt: minutesAgo(40) })]) });
    expect(byKey(abandoned, "alertEvaluation").reasons[0].category).toBe("run_interrupted");
  });

  test("degraded source failures are listed separately; delivery-only degradation stays under delivery", () => {
    const sourceRun = run({ status: "degraded", sourceFailures: ["forecast", "gauge:4009-level"], errors: 2, errorCategories: { MongoServerError: 2 }, gaugeSources: { "4009-level": { status: "stale", newestObservedAt: minutesAgo(200) } } });
    const components = build({ runs: ok([sourceRun]) });
    expect(byKey(components, "alertEvaluation").reasons.map((item) => item.category)).toEqual(["source:forecast", "source:gauge:4009-level", "rule_errors"]);
    expect(byKey(components, "alertForecastInput").reasons[0].category).toBe("forecast_unusable");
    expect(byKey(components, "alertGaugeInputs").reasons[0].category).toBe("gauge:4009-level");

    const deliveryOnly = build({ runs: ok([run({ status: "degraded", outstandingDeliveries: { staleClaims: 0, uncertain: 1, heldForReview: 2 }, deliveryIndex: "missing" })]) });
    expect(byKey(deliveryOnly, "alertEvaluation").state).toBe("healthy");
    expect(byKey(deliveryOnly, "alertDelivery").reasons.map((item) => item.category)).toEqual(["held_for_review", "uncertain_sends", "delivery_index_missing"]);
  });

  test("delivery reports aggregate counts and recent definite failures", () => {
    const components = build({ runs: ok([run({ sent: 2 }), run({ failed: 1, status: "degraded", startedAt: minutesAgo(20) })]) });
    const delivery = byKey(components, "alertDelivery");
    expect(delivery.reasons.map((item) => item.category)).toEqual(["recent_send_failures"]);
    expect(delivery.facts).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Alerts sent in last 2 completed runs", value: 2 })]));
  });

  test("no live gauge alerts means gauges are not checked and not flagged", () => {
    const gauges = byKey(build({ runs: ok([run({ gaugeSources: {} })]) }), "alertGaugeInputs");
    expect(gauges).toMatchObject({ state: "unknown", attention: false });
  });

  test("a failed run read makes only the alert components unknown", () => {
    const components = build({ runs: failed() });
    for (const key of ["alertEvaluation", "alertDelivery", "alertGaugeInputs", "alertForecastInput"]) {
      expect(byKey(components, key).reasons[0].category).toBe("evidence_read_failed");
    }
    expect(byKey(components, "hppEvaluation").state).toBe("healthy");
    expect(byKey(components, "waterQuality").state).toBe("healthy");
  });
});

describe("CSO and water quality", () => {
  test("a stale Sewage Map summary is degraded", () => {
    expect(byKey(build({ summary: ok(summary(90)) }), "waterQuality").reasons[0].category).toBe("summary_stale");
  });

  test("a stale summary is information only when every consumer uses RDP", () => {
    const env = { ...SHADOW_ENV, RDP_CSO_SOURCE: "rdp", RDP_WQ_ASSESSMENT: "rdp", RDP_CSO_MEMBERSHIP: "rdp" };
    expect(byKey(build({ summary: ok(summary(900)) }, env), "waterQuality").state).toBe("healthy");
  });

  test("an unavailable RDP assessment at the alert run shows its recorded reason", () => {
    const components = build({ runs: ok([run({ status: "degraded", waterQualitySource: "rdp", sourceFailures: ["wq-assessment"], waterQuality: { level: null, reason: "rdp_timeout" } })]) }, { ...SHADOW_ENV, RDP_WQ_ASSESSMENT: "rdp" });
    const water = byKey(components, "waterQuality");
    expect(water.reasons[0].category).toBe("alert_input:wq-assessment");
    expect(water.reasons[0].message).toContain("rdp_timeout");
  });

  test("invalid configuration and a failed summary read are reported separately", () => {
    const water = byKey(build({ summary: failed() }, { ...SHADOW_ENV, RDP_CSO_SOURCE: "bogus" }), "waterQuality");
    expect(water.reasons.map((item) => item.category)).toEqual(["invalid_config:RDP_CSO_SOURCE", "summary_read_failed"]);
    expect(water.state).toBe("degraded");
  });
});

describe("redaction", () => {
  test("never exposes subscriber details, tokens, credentials or raw provider errors", () => {
    const leaky = run({
      status: "failed", errorCategory: "Error: 401 from https://api.resend.com key=re_live_abc123",
      email: "subscriber@example.com", unsubscribeToken: "tok_abc", idempotencyKey: "idem-secret",
      sourceFailures: ["gauge:subscriber@example.com"],
      gaugeSources: { "4009-level": { status: "error", error: "provider said: Bearer eyJsecret" } },
    });
    const health = freshHealth({ holdSince: minutesAgo(30), holdReason: "stale", lastSourceError: "fetch https://user:pw@rdp/x" });
    const components = build({ runs: ok([leaky, run({ status: "degraded", startedAt: minutesAgo(20), sourceFailures: ["gauge:4009-level"], gaugeSources: { "4009-level": { status: "error", error: "Bearer eyJsecret" } } })]), shadowState: ok(hppState(health)), summary: failed() });
    const payload = JSON.stringify(components);
    for (const secret of ["subscriber@example.com", "tok_abc", "idem-secret", "re_live_abc123", "resend.com", "eyJsecret", "user:pw", "secret@host"]) {
      expect(payload).not.toContain(secret);
    }
    expect(payload).toContain("run_failed:other");
  });

  test("safeCategory withholds anything that is not an identifier", () => {
    expect(safeCategory("MongoNetworkError")).toBe("MongoNetworkError");
    expect(safeCategory("gauge:4009-level")).toBe("gauge:4009-level");
    expect(safeCategory("a b")).toBe("other");
    expect(safeCategory({})).toBe("other");
  });
});

describe("bounded reads", () => {
  function fakeDb(collections, calls) {
    return {
      collection(name) {
        const docs = collections[name] ?? [];
        return {
          findOne: async (filter, options) => { calls.push({ name, op: "findOne", filter, options }); return docs[0] ?? null; },
          find: (filter, options) => {
            const cursor = { sorted: null, limit: null };
            calls.push({ name, op: "find", filter, options, cursor });
            return {
              sort(sort) { cursor.sorted = sort; return this; },
              limit(limit) { cursor.limit = limit; return this; },
              toArray: async () => docs.slice(0, cursor.limit ?? docs.length),
            };
          },
          countDocuments: () => { throw new Error("overview must not count documents"); },
          updateOne: () => { throw new Error("overview must not write"); },
          insertOne: () => { throw new Error("overview must not write"); },
        };
      },
    };
  }

  test("reads only the latest records by indexed keys, with a bounded run window and no writes", async () => {
    const calls = [];
    const db = fakeDb({ hppShadowState: [hppState()], alertRuns: [run()], openIndicator: [{ timestamp: minutesAgo(600), value: false }] }, calls);
    const readWaterQualitySummary = jest.fn().mockResolvedValue(summary());
    const result = await getOperationalOverview({ db, env: SHADOW_ENV, now: NOW, readWaterQualitySummary });

    expect(result.checkedAt).toBe(NOW.toISOString());
    expect(result.components).toHaveLength(6);
    expect(readWaterQualitySummary).toHaveBeenCalledTimes(1);
    const runsRead = calls.find((call) => call.name === "alertRuns");
    expect(runsRead.cursor).toEqual({ sorted: { _id: -1 }, limit: RECENT_RUN_LIMIT });
    expect(Object.keys(runsRead.options.projection)).not.toEqual(expect.arrayContaining(["email", "runId"]));
    expect(calls.map((call) => call.name).sort()).toEqual(["alertRuns", "hppShadowState", "hppStatusState", "hppWriterControl", "openIndicator"]);
    expect(calls.some((call) => ["alertSubscriptions", "alertDeliveries"].includes(call.name))).toBe(false);
  });

  test("an unreachable database still returns a partial overview of unknown components", async () => {
    connectToDatabase.mockRejectedValue(new Error("down"));
    const result = await getOperationalOverview({ env: SHADOW_ENV, now: NOW });
    expect(result.components.map((item) => item.state)).toEqual(["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"]);
    expect(buildNeedsAttention(result.components)).toHaveLength(6);
  });
});

describe("source check classification", () => {
  const health = (state, minutes = 5) => ({ name: "levels", latencyMs: 12, health: { source: "x", state, generatedAt: minutesAgo(minutes) } });

  test.each([
    ["fresh", "healthy"],
    ["fallback", "degraded"],
    ["stale", "degraded"],
    ["unavailable", "unavailable"],
  ])("%s source health is %s", (state, expected) => {
    expect(classifySourceCheck(health(state), NOW.getTime()).state).toBe(expected);
  });

  test("a missing result is unknown and an old fresh result is re-checked as stale", () => {
    expect(classifySourceCheck({ name: "forecast" }, NOW.getTime())).toMatchObject({ state: "unknown", attention: true });
    expect(classifySourceCheck(health("fresh", 120), NOW.getTime())).toMatchObject({ state: "degraded", sourceState: "stale" });
  });
});
