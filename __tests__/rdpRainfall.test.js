/** @jest-environment node */
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient } from "@aws-sdk/client-sts";
import { createRdpClient } from "../libs/rdp/client";
import { RDP_STAGING_API_URL } from "../libs/rdp/config";
import { getRainfallMeasurement, RDP_MEASUREMENTS, RDP_RAINFALL_MEASUREMENTS } from "../libs/rdp/measurements";
import { parseRainfallHistory, parseRainfallLatest } from "../libs/rdp/rainfallContract";
import golden from "./fixtures/rdp-rainfall-history-contract.json";
import { historyBody, latestBody, latestRow, PERIOD_MS, rainfallRow, RAINFALL_IDS } from "../testUtils/rdpRainfallFixtures";

jest.mock("server-only", () => ({}));
jest.mock("@vercel/oidc", () => ({ getVercelOidcToken: jest.fn() }));
jest.mock("@aws-sdk/client-sts", () => ({
  STSClient: jest.fn(),
  AssumeRoleWithWebIdentityCommand: jest.fn(function (input) { this.input = input; }),
}));
jest.mock("node:timers/promises", () => ({ setTimeout: jest.fn().mockResolvedValue() }));

const preview = {
  VERCEL_ENV: "preview", RDP_API_URL: RDP_STAGING_API_URL, RDP_AWS_REGION: "eu-west-1",
  RDP_ROLE_ARN: "arn:aws:iam::080812383734:role/river-data-platform-staging-vercel-preview",
};
const response = (status, body) => ({ status, ok: status === 200, headers: new Headers(), json: jest.fn().mockResolvedValue(body) });
const clone = (value) => JSON.parse(JSON.stringify(value));
const T0 = Date.UTC(2026, 10, 18, 9, 0);
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  getVercelOidcToken.mockResolvedValue("token");
  STSClient.mockImplementation(() => ({ send: jest.fn().mockResolvedValue({ Credentials: {
    AccessKeyId: "ASIAFIXTURE", SecretAccessKey: "secret", SessionToken: "session", Expiration: new Date(Date.now() + 900000),
  } }) }));
});
afterEach(() => { global.fetch = originalFetch; });

describe("rainfall measurement map", () => {
  it("names the six published predictor gauges as 15-minute mm period totals, apart from the level/flow map", () => {
    expect(RDP_RAINFALL_MEASUREMENTS.map((m) => m.measurementId).sort()).toEqual([...RAINFALL_IDS].sort());
    expect(getRainfallMeasurement("ea-stone-rainfall")).toMatchObject({
      reference: "3014", unit: "mm", periodSeconds: 900, providerMeasureId: "3014-rainfall-tipping_bucket_raingauge-t-15_min-mm",
    });
    // The level/flow map (and so Trent station order and level validation) is unchanged.
    expect(Object.values(RDP_MEASUREMENTS).some((m) => m.measurementId.endsWith("-rainfall"))).toBe(false);
    expect(() => getRainfallMeasurement("ea-colwick-level")).toThrow("INVALID_MEASUREMENT");
  });
});

describe("parseRainfallHistory", () => {
  it("accepts RDP's golden response: labelled intervals, verified boundaries, an incomplete window with no total", () => {
    const parsed = parseRainfallHistory(clone(golden), "ea-stone-rainfall");
    expect(parsed.intervals).toHaveLength(8);
    expect(parsed.intervals[5]).toMatchObject({
      label: "2026-10-22T06:15:00.000Z", labelConvention: "period_end", periodStart: "2026-10-22T06:00:00.000Z",
      periodEnd: "2026-10-22T06:15:00.000Z", totalMm: 0.2, eligible: true, revision: 1,
    });
    expect(parsed.window).toMatchObject({ status: "incomplete", expected: 10, reported: 8, absent: 2, totalMm: null });
    expect(parsed.nextCursor).toBeNull();
  });

  it("keeps an unverified label without physical boundaries and an ineligible depth as no amount (not zero)", () => {
    const rows = [rainfallRow("ea-ashbourne-rainfall", T0, 0.2), rainfallRow("ea-ashbourne-rainfall", T0 + PERIOD_MS, 0, { eligible: false, quality: "Missing" })];
    const parsed = parseRainfallHistory(historyBody("ea-ashbourne-rainfall", rows, { fromMs: T0, toMs: T0 + 2 * PERIOD_MS }), "ea-ashbourne-rainfall");
    expect(parsed.intervals.map((row) => [row.labelConvention, row.periodStart, row.totalMm])).toEqual([["unverified", null, 0.2], ["unverified", null, null]]);
    expect(parsed.window).toMatchObject({ status: "incomplete", ineligible: 1, totalMm: null });
  });

  it("accepts a paginated page whose window RDP withholds", () => {
    const body = historyBody("ea-stone-rainfall", [rainfallRow("ea-stone-rainfall", T0, 0)], { fromMs: T0, toMs: T0 + PERIOD_MS, window: null, nextCursor: "abc_123" });
    expect(parseRainfallHistory(body, "ea-stone-rainfall")).toMatchObject({ window: null, nextCursor: "abc_123" });
  });

  const broken = {
    "unverified label offering boundaries": (b) => { b.data[0].labelConvention = "unverified"; },
    "boundaries that disagree with the convention": (b) => { b.data[0].periodStart = b.data[1].periodStart; },
    "negative depth": (b) => { b.data[0].totalMm = -0.2; },
    "another provider measure": (b) => { b.data[0].providerMeasureId = "3014-level-stage-i-15_min-mASD"; },
    "a label off the 15-minute grid": (b) => { b.data[0].label = "2026-10-22T04:31:00.0000000Z"; },
    "a repeated label": (b) => { b.data[1] = clone(b.data[0]); },
    "an instantaneous row": (b) => { b.data[0] = { observedAt: b.data[0].label, value: 0.2, unit: "mm" }; },
    "another period length": (b) => { b.data[0].periodSeconds = 3600; },
    "an unknown convention": (b) => { b.data[0].labelConvention = "period_middle"; },
    "an eligible row with an ineligible reason": (b) => { b.data[0].ineligibleReason = "QualitySuspect"; },
    "a revision below 1": (b) => { b.data[0].revision = 0; },
    "another measurement's envelope": (b) => { b.meta.measurementId = "ea-wanlip-rainfall"; },
    "an instantaneous envelope": (b) => { delete b.meta.valueType; },
    "an unverified page": (b) => { b.meta.pageIntegrity = "unverified"; },
    "an incomplete window claiming a total": (b) => { b.meta.window.totalMm = 0.2; },
    "a complete window without a total": (b) => { b.meta.window.status = "complete"; },
    "window counts that do not add up": (b) => { b.meta.window.absent = 1; },
    "a missing window that is not explained as paginated": (b) => { b.meta.window = null; },
  };
  it.each(Object.keys(broken))("refuses %s", (name) => {
    const body = clone(golden);
    broken[name](body);
    expect(() => parseRainfallHistory(body, "ea-stone-rainfall")).toThrow("RESPONSE_CONTRACT_ERROR");
  });
});

describe("parseRainfallLatest", () => {
  const ids = ["ea-stone-rainfall", "ea-lea-marston-rainfall"];
  it("reads the newest label, its convention and RDP freshness, never an instantaneous value", () => {
    const parsed = parseRainfallLatest(latestBody([
      latestRow(ids[0], T0, { convention: "period_end", totalMm: 0.4, freshness: "stale" }),
      latestRow(ids[1], null, { status: "no_observations" }),
    ]), ids);
    expect(parsed[0]).toMatchObject({ status: "available", label: new Date(T0).toISOString(), labelConvention: "period_end",
      periodStart: new Date(T0 - PERIOD_MS).toISOString(), totalMm: 0.4, freshness: "stale" });
    expect(parsed[1]).toMatchObject({ status: "no_observations", label: null });
  });

  const broken = {
    "a level-style value": (rows) => { rows[0].value = 0.4; },
    "a level-style observedAt": (rows) => { rows[0].observedAt = rows[0].label; },
    "another unit": (rows) => { rows[0].unit = "m"; },
    "an instantaneous row": (rows) => { rows[0].valueType = undefined; },
    "rows out of request order": (rows) => { rows.reverse(); },
    "an unverified label with a period": (rows) => { rows[1].periodStart = rows[1].label; },
    "an unknown freshness": (rows) => { rows[0].freshness = "live"; },
  };
  it.each(Object.keys(broken))("refuses %s", (name) => {
    const rows = [latestRow(ids[0], T0, { convention: "period_end" }), latestRow(ids[1], T0)];
    broken[name](rows);
    expect(() => parseRainfallLatest(latestBody(rows), ids)).toThrow("RESPONSE_CONTRACT_ERROR");
  });
});

describe("client rainfall reads", () => {
  it("signs a bounded history read and returns the parsed period totals", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, clone(golden)));
    const result = await createRdpClient(preview).getRainfallObservations("ea-stone-rainfall",
      { from: "2026-10-22T04:30:00Z", to: "2026-10-22T07:00:00Z", limit: 1000 });
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/staging/v1/measurements/ea-stone-rainfall/observations");
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: "2026-10-22T04:30:00Z", to: "2026-10-22T07:00:00Z", limit: "1000" });
    expect(global.fetch.mock.calls[0][1].headers.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(result.window.status).toBe("incomplete");
  });

  it("reads the latest interval for the requested gauges in one request", async () => {
    global.fetch = jest.fn().mockResolvedValue(response(200, latestBody(RAINFALL_IDS.map((id) => latestRow(id, T0)))));
    const rows = await createRdpClient(preview).getRainfallLatest(RAINFALL_IDS);
    expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get("ids")).toBe(RAINFALL_IDS.join(","));
    expect(rows.map((row) => row.labelConvention)).toEqual(RAINFALL_IDS.map(() => "unverified"));
  });

  it("never reads a level as rainfall or rainfall as a level", () => {
    global.fetch = jest.fn();
    const client = createRdpClient(preview);
    const query = { from: "2026-10-22T04:30:00Z", to: "2026-10-22T07:00:00Z" };
    expect(() => client.getRainfallObservations("ea-colwick-level", query)).toThrow("INVALID_MEASUREMENT");
    expect(() => client.getRainfallLatest(["ea-colwick-level"])).toThrow("INVALID_MEASUREMENT");
    expect(() => client.getObservations("ea-stone-rainfall", query)).toThrow("INVALID_MEASUREMENT");
    expect(() => client.getLatest(["ea-stone-rainfall"])).toThrow("INVALID_MEASUREMENT");
    expect(() => client.getRainfallObservations("ea-stone-rainfall", { ...query, to: query.from })).toThrow("INVALID_QUERY");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [404, { error: { code: "MEASUREMENT_NOT_FOUND" } }, "MEASUREMENT_NOT_FOUND"],
    [403, { message: "Forbidden" }, "AUTHORIZATION_FAILED"],
  ])("maps HTTP %s to a fixed code without retrying", async (status, body, code) => {
    global.fetch = jest.fn().mockResolvedValue(response(status, body));
    await expect(createRdpClient(preview).getRainfallLatest(["ea-stone-rainfall"])).rejects.toMatchObject({ code });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a contract-breaking body as a whole", async () => {
    const body = clone(golden);
    body.data[0].totalMm = -1;
    global.fetch = jest.fn().mockResolvedValue(response(200, body));
    await expect(createRdpClient(preview).getRainfallObservations("ea-stone-rainfall",
      { from: "2026-10-22T04:30:00Z", to: "2026-10-22T07:00:00Z" })).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  });
});
