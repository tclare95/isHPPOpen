/** @jest-environment node */
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient } from "@aws-sdk/client-sts";
import { setTimeout as delay } from "node:timers/promises";
import { createRdpClient } from "../libs/rdp/client";
import { getRdpConfig, getRdpSourceModes, RDP_STAGING_API_URL } from "../libs/rdp/config";
import { getRdpMeasurement, RDP_MEASUREMENTS, assertRdpCatalogueMeasurement } from "../libs/rdp/measurements";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../libs/trentWeirsConfig";
import { spawnSync } from "node:child_process";
import fixture from "./fixtures/rdp-read-api.json";
import eaMetadata from "./fixtures/rdp-ea-metadata.json";
import { runRdpPreviewSmoke } from "../libs/rdp/previewSmoke";

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
// Deliberately fictional: no production read API is provisioned by this slice.
const production = {
  VERCEL_ENV: "production", RDP_API_URL: "https://prodtest123.execute-api.eu-west-1.amazonaws.com/production", RDP_AWS_REGION: "eu-west-1",
  RDP_ROLE_ARN: "arn:aws:iam::080812383734:role/river-data-platform-production-vercel-production",
};
const ids = ["ea-colwick-level", "ea-shardlow-level", "ea-shardlow-flow"];
const windowQuery = { from: "2026-10-24T09:00:00Z", to: "2026-10-24T10:00:00Z" };
const send = jest.fn();
const response = (status, body, headers = {}) => ({
  status, ok: status === 200, headers: new Headers(headers), json: jest.fn().mockResolvedValue(body),
});
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  getVercelOidcToken.mockResolvedValue("sensitive-preview-token");
  send.mockReset().mockResolvedValue({ Credentials: {
    AccessKeyId: "ASIAFIXTURE", SecretAccessKey: "fixture-secret", SessionToken: "fixture-session",
    Expiration: new Date(Date.now() + 900000),
  } });
  STSClient.mockImplementation(() => ({ send }));
  global.fetch = jest.fn().mockResolvedValue(response(200, fixture.registry));
});
afterEach(() => { jest.useRealTimers(); global.fetch = originalFetch; });

test("source modes default independently to legacy without requiring RDP credentials", () => {
  expect(getRdpSourceModes({})).toEqual({ RDP_TRENT_SOURCE: "legacy", RDP_LEVELS_SOURCE: "legacy", RDP_GAUGE_ALERTS_SOURCE: "legacy" });
  expect(getRdpSourceModes({ RDP_TRENT_SOURCE: "shadow", RDP_LEVELS_SOURCE: "rdp" })).toEqual({ RDP_TRENT_SOURCE: "shadow", RDP_LEVELS_SOURCE: "rdp", RDP_GAUGE_ALERTS_SOURCE: "legacy" });
  expect(getVercelOidcToken).not.toHaveBeenCalled();
});

test.each(["", "RDP", "prod", " legacy", "false"])("invalid mode %j fails closed", (mode) => {
  expect(() => getRdpSourceModes({ RDP_GAUGE_ALERTS_SOURCE: mode })).toThrow("CONFIGURATION_ERROR");
});

test.each([
  {}, { ...preview, VERCEL_ENV: "development" }, { ...preview, VERCEL_ENV: undefined },
  { ...preview, RDP_ROLE_ARN: production.RDP_ROLE_ARN }, { ...production, RDP_ROLE_ARN: preview.RDP_ROLE_ARN },
  { ...preview, RDP_API_URL: production.RDP_API_URL }, { ...production, RDP_API_URL: preview.RDP_API_URL },
  { ...production, RDP_API_URL: preview.RDP_API_URL.replace("/staging", "/production") },
  { ...preview, RDP_API_URL: preview.RDP_API_URL.replace("jfwpvzs8ig", "otherapi") },
  { ...preview, RDP_AWS_REGION: "eu-west-2" }, { ...preview, RDP_AWS_REGION: undefined },
  { ...preview, RDP_ROLE_ARN: preview.RDP_ROLE_ARN.replace("080812383734", "123456789012") },
  ...["?x=1", "#fragment", "/", "/../production"].map((suffix) => ({ ...preview, RDP_API_URL: preview.RDP_API_URL + suffix })),
  { ...preview, RDP_API_URL: "https://attacker.example/staging" },
  { ...preview, RDP_API_URL: preview.RDP_API_URL.replace("https://", "http://") },
  { ...preview, RDP_API_URL: preview.RDP_API_URL.replace("https://", "https://user@") },
  { ...preview, RDP_API_URL: preview.RDP_API_URL.replace(".com/", ".com:443/") },
])("invalid/isolation configuration fails before STS or HTTP: %j", (env) => {
  expect(() => createRdpClient(env)).toThrow("CONFIGURATION_ERROR");
  expect(send).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([preview, production])("correct environment signs only its own target", async (env) => {
  const client = createRdpClient(env);
  expect(await client.listMeasurements()).toEqual(fixture.registry);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(`${env.RDP_API_URL}/v1/measurements`);
  expect(options).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
  expect(options.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=ASIAFIXTURE\/\d{8}\/eu-west-1\/execute-api\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=[a-f0-9]{64}$/);
  expect(options.headers["x-amz-security-token"]).toBe("fixture-session");
  expect(options.headers).not.toHaveProperty("WebIdentityToken");
  expect(send.mock.calls[0][0].input).toEqual({ RoleArn: env.RDP_ROLE_ARN, RoleSessionName: `ishppopen-${getRdpConfig(env).stage}`, DurationSeconds: 900, WebIdentityToken: "sensitive-preview-token" });
  expect(STSClient).toHaveBeenCalledWith({ region: "eu-west-1", endpoint: "https://sts.eu-west-1.amazonaws.com", maxAttempts: 1, requestHandler: { connectionTimeout: 3000, requestTimeout: 5000, throwOnRequestTimeout: true } });
});

test("latest preserves partial failures, no observations, freshness, negative values and request order", async () => {
  global.fetch.mockResolvedValue(response(200, fixture.latest));
  expect(await createRdpClient(preview).getLatest(ids)).toEqual(fixture.latest);
  expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get("ids")).toBe(ids.join(","));
});

test("stale readings retain their observation time and are never relabelled fresh", async () => {
  const stale = { ...fixture.latest, data: [{ ...fixture.latest.data[0], freshness: "stale", observedAt: "2026-10-20T09:45:00Z" }] };
  global.fetch.mockResolvedValue(response(200, stale));
  expect(await createRdpClient(preview).getLatest([ids[0]])).toEqual(stale);
});

test("history forwards one opaque page/cursor and encoded offsets, without inferring coverage", async () => {
  global.fetch.mockResolvedValue(response(200, fixture.history));
  const query = { from: "2026-10-24T10:00:00+01:00", to: "2026-10-24T11:00:00+01:00", limit: 2, cursor: "opaque_cursor-fixture" };
  expect(await createRdpClient(preview).getObservations(ids[0], query)).toEqual(fixture.history);
  expect(global.fetch.mock.calls[0][0]).toContain("%2B01%3A00");
  expect(new URL(global.fetch.mock.calls[0][0]).searchParams.get("cursor")).toBe(query.cursor);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("health preserves independent source/persistence/freshness states", async () => {
  global.fetch.mockResolvedValue(response(200, fixture.health));
  expect(await createRdpClient(preview).getHealth(ids[0])).toEqual(fixture.health);
});

test.each([
  [403, { message: "sensitive upstream body" }, "AUTHORIZATION_FAILED"],
  [400, { error: { code: "VALIDATION_ERROR" } }, "VALIDATION_ERROR"],
  [404, { error: { code: "MEASUREMENT_NOT_FOUND" } }, "MEASUREMENT_NOT_FOUND"],
  [400, { error: { code: "INVALID_CURSOR" } }, "INVALID_CURSOR"],
  [409, { error: { code: "CURSOR_EXPIRED" } }, "CURSOR_EXPIRED"],
  [409, { error: { code: "CURSOR_STALE" } }, "CURSOR_STALE"],
  [503, { error: { code: "ARCHIVE_INTEGRITY" } }, "ARCHIVE_INTEGRITY"],
])("HTTP %i safe error %j is not retried", async (status, body, code) => {
  global.fetch.mockResolvedValue(response(status, body));
  await expect(createRdpClient(preview).getObservations(ids[0], windowQuery)).rejects.toMatchObject({ code, status, message: `RDP ${code}` });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([
  [429, {}, "THROTTLED"], [500, {}, "UPSTREAM_ERROR"],
  [503, { error: { code: "STORAGE_UNAVAILABLE" } }, "STORAGE_UNAVAILABLE"],
  [504, { error: { code: "QUERY_TIMEOUT" } }, "QUERY_TIMEOUT"],
])("HTTP %i retries once with clamped Retry-After and fresh signature", async (status, body, code) => {
  global.fetch.mockResolvedValue(response(status, body, { "retry-after": "9999" }));
  await expect(createRdpClient(preview).listMeasurements()).rejects.toMatchObject({ code, status });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(delay).toHaveBeenCalledWith(2000, undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(send).toHaveBeenCalledTimes(1);
});

test("transient error recovers, but unknown upstream error text is never retained", async () => {
  global.fetch.mockRejectedValueOnce(new Error("sensitive-url-and-credentials"));
  expect(await createRdpClient(preview).listMeasurements()).toEqual(fixture.registry);
  global.fetch.mockResolvedValue(response(500, { error: { code: "sensitive-preview-token", message: "fixture-secret" } }));
  const error = await createRdpClient(preview).listMeasurements().catch((value) => value);
  expect(JSON.stringify(error)).not.toMatch(/sensitive|fixture-secret/);
  expect(error).not.toHaveProperty("cause");
});

test("30 second total budget aborts a hung response without extra requests", async () => {
  jest.useFakeTimers();
  global.fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("sensitive-url")))));
  const pending = expect(createRdpClient(preview).listMeasurements()).rejects.toMatchObject({ code: "TIMEOUT" });
  await jest.advanceTimersByTimeAsync(30000);
  await pending;
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("the total budget also bounds token acquisition", async () => {
  jest.useFakeTimers();
  getVercelOidcToken.mockReturnValue(new Promise(() => {}));
  const pending = expect(createRdpClient(preview).listMeasurements()).rejects.toMatchObject({ code: "TIMEOUT" });
  await jest.advanceTimersByTimeAsync(30000);
  await pending;
  expect(send).not.toHaveBeenCalled();
});

test("opt-in Preview smoke uses four read routes and returns only redacted evidence", async () => {
  global.fetch.mockResolvedValueOnce(response(200, fixture.registry))
    .mockResolvedValueOnce(response(200, fixture.latest))
    .mockResolvedValueOnce(response(200, fixture.health))
    .mockResolvedValueOnce(response(200, fixture.history));
  const result = await runRdpPreviewSmoke({ ...preview, VERCEL: "1" });
  expect(result).toMatchObject({ result: "passed", context: "vercel-build", sources: getRdpSourceModes({}), historyRows: 2 });
  expect(global.fetch).toHaveBeenCalledTimes(4);
  expect(new URL(global.fetch.mock.calls[3][0]).searchParams.get("limit")).toBe("2");
  expect(JSON.stringify(result)).not.toMatch(/sensitive|fixture-secret|fixture-session|execute-api|nextCursor|sourceReference/);
});

test.each([
  { ...production, VERCEL: "1" }, { ...preview, VERCEL: undefined },
  { ...preview, VERCEL: "1", RDP_TRENT_SOURCE: "shadow" },
  { ...preview, VERCEL: "1", RDP_GAUGE_ALERTS_SOURCE: "rdp" },
])("smoke refuses non-Preview or activated sources", async (env) => {
  await expect(runRdpPreviewSmoke(env)).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each(["token", "sts", "credentials"])("%s failure is redacted and never falls back to static/default AWS credentials", async (failure) => {
  if (failure === "token") getVercelOidcToken.mockRejectedValue(new Error("sensitive-preview-token"));
  if (failure === "sts") send.mockRejectedValue(new Error("fixture-secret"));
  if (failure === "credentials") send.mockResolvedValue({ Credentials: {} });
  await expect(createRdpClient(preview).listMeasurements()).rejects.toMatchObject({ code: "AUTHENTICATION_FAILED", message: "RDP AUTHENTICATION_FAILED" });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("short-lived credentials refresh using a newly acquired token", async () => {
  jest.useFakeTimers();
  const client = createRdpClient(preview);
  await client.listMeasurements();
  await client.listMeasurements();
  expect(getVercelOidcToken).toHaveBeenCalledTimes(1);
  jest.setSystemTime(Date.now() + 841000);
  send.mockResolvedValue({ Credentials: { AccessKeyId: "ASIAREFRESH", SecretAccessKey: "new-secret", SessionToken: "new-session", Expiration: new Date(Date.now() + 900000) } });
  await client.listMeasurements();
  expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls[2][1].headers["x-amz-security-token"]).toBe("new-session");
});

test.each([
  () => createRdpClient(preview).getLatest([]),
  () => createRdpClient(preview).getLatest([ids[0], ids[0]]),
  () => createRdpClient(preview).getLatest(["4009-level"]),
  () => createRdpClient(preview).getHealth("../../production"),
  ...[{ from: "2026-01-01", to: "2026-01-02" }, { ...windowQuery, limit: 5001 },
    { ...windowQuery, cursor: "?host=other" }, { ...windowQuery, to: windowQuery.from },
    { from: "2024-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" }].map((query) => () => createRdpClient(preview).getObservations(ids[0], query)),
])("invalid request fails before credentials/network", (call) => {
  expect(call).toThrow();
  expect(send).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  {}, { data: [], meta: {} },
  { ...fixture.latest, data: fixture.latest.data.slice().reverse() },
  { ...fixture.latest, data: fixture.latest.data.map((row) => ({ ...row, unit: "cm" })) },
])("malformed latest response fails without retry", async (body) => {
  global.fetch.mockResolvedValue(response(200, body));
  await expect(createRdpClient(preview).getLatest(ids)).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("history identity/datum/integrity mismatch is rejected", async () => {
  for (const body of [
    { ...fixture.history, meta: { ...fixture.history.meta, pageIntegrity: "unknown" } },
    { ...fixture.history, data: [{ ...fixture.history.data[0], datum: "ODN" }] },
    { ...fixture.history, data: [{ ...fixture.history.data[0], providerMeasureId: "4007-level-stage-i-15_min-mASD" }] },
  ]) {
    global.fetch.mockResolvedValue(response(200, body));
    await expect(createRdpClient(preview).getObservations(ids[0], windowQuery)).rejects.toMatchObject({ code: "RESPONSE_CONTRACT_ERROR" });
  }
});

test("exact six aliases cover the existing dashboard without conflating Shardlow", () => {
  expect(Object.keys(RDP_MEASUREMENTS)).toEqual(TRENT_DASHBOARD_STATIONS.map(getTrentStationKey));
  expect(Object.values(RDP_MEASUREMENTS).map((entry) => entry.measurementId)).toEqual([
    "ea-colwick-level", "ea-clifton-bridge-level", "ea-shardlow-level", "ea-church-wilne-level", "ea-kegworth-level", "ea-shardlow-flow",
  ]);
  expect(getRdpMeasurement("4007-level")).toMatchObject({ unit: "mASD", datum: "ASD", providerMeasureId: "4007-level-stage-i-15_min-mASD" });
  expect(getRdpMeasurement("4007-flow")).toMatchObject({ unit: "m3/s", datum: "unknown", providerMeasureId: "4007-flow--i-15_min-m3_s" });
  expect(() => getRdpMeasurement("4007")).toThrow("INVALID_MEASUREMENT");
  expect(() => getRdpMeasurement("toString")).toThrow("INVALID_MEASUREMENT");
});

test.each(eaMetadata.items)("reserved alias matches verified exact EA metadata: %j", (entry) => {
  const alias = `${entry.station.split("/").pop()}-${entry.parameter}`;
  expect(getRdpMeasurement(alias)).toMatchObject({
    parameter: entry.parameter, unit: entry.unitName, datum: "ASD", providerMeasureId: entry["@id"].split("/").pop(),
  });
  expect(entry.period).toBe(900);
  expect(entry.qualifier).toBe("Stage");
});

test("catalogue validation checks identity, units/datum, cadence and publication", () => {
  expect(assertRdpCatalogueMeasurement("4009-level", fixture.registry.data).measurementId).toBe(ids[0]);
  for (const [key, value] of Object.entries({ stationId: "ea-shardlow", unit: "cm", datum: "ODN", parameter: "flow", expectedIntervalSeconds: 3600, provider: "other", sourceId: "other" })) {
    expect(() => assertRdpCatalogueMeasurement("4009-level", [{ ...fixture.registry.data[0], [key]: value }])).toThrow("MEASUREMENT_CONTRACT_ERROR");
  }
  expect(() => assertRdpCatalogueMeasurement("4009-level", [fixture.registry.data[0], fixture.registry.data[0]])).toThrow("MEASUREMENT_CONTRACT_ERROR");
  expect(() => assertRdpCatalogueMeasurement("4126-level", fixture.registry.data)).toThrow("MEASUREMENT_CONTRACT_ERROR");
});

test("real server-only package blocks importing the client outside the server condition", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import('./libs/rdp/client.js')"], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("cannot be imported from a Client Component module");
});
