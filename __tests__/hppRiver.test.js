/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

import fixture from "../libs/rdp/fixtures/hpp-river.json";
import { parseRiverLocation, parseRiverTrace, readRiverJson, RIVER_MAX_BYTES, riverSamplePath } from "../libs/rdp/river";
import { RdpError } from "../libs/rdp/errors";
import { createRdpClient } from "../libs/rdp/client";
import { getHppRiverContext, HPP_RIVER_ANCHOR, hppRiverFixturesEnabled } from "../libs/services/hppRiverService";

const clone = (value) => structuredClone(value);
const located = () => parseRiverLocation(clone(fixture.locate));
const parsed = (direction, geometry = "reaches") => {
  const body = clone(fixture[direction]);
  if (geometry === "none") body.riverTracer.geometry = "omitted";
  return parseRiverTrace(body, located(), direction, geometry);
};
const reader = () => ({ locateRiver: jest.fn().mockResolvedValue(located()),
  getRiverTrace: jest.fn(async (location, direction, geometry) => parsed(direction, geometry)) });

beforeEach(() => jest.clearAllMocks());

test.each(["upstream", "downstream"])("%s retains source, confidence, summaries and route evidence", (direction) => {
  const trace = parsed(direction);
  const expected = fixture[direction].riverTracer;
  for (const key of ["network", "releaseVersion", "match", "route", "summary", "attribution", "licence", "licenceUrl", "caveats"]) {
    expect(trace.riverTracer[key]).toEqual(expected[key]);
  }
  expect(located().sample.snapOffsetM).toBe(71);
  expect(trace.features).toEqual(fixture[direction].features);
});

test("upstream preserves catchment displacement and summary-only removes all geometry", () => {
  const trace = parsed("upstream", "none");
  expect(trace.features).toEqual([]);
  expect(trace.riverTracer.catchment).toEqual(fixture.upstream.riverTracer.catchment);
  expect(trace.riverTracer.catchment.pourPointOffsetM).toBe(100.1);
});

test("incomplete routes and absent/unloaded catchments remain qualified", () => {
  for (const status of ["unavailable", "not-loaded"]) {
    const body = clone(fixture.upstream);
    body.riverTracer.route = { ...body.riverTracer.route, completeness: "incomplete", termination: "dead-end", reasons: ["dead-end"] };
    body.riverTracer.catchment = { status, reason: "NoPublishedCatchment" };
    const trace = parseRiverTrace(body, located(), "upstream");
    expect(trace.riverTracer.route.completeness).toBe("incomplete");
    expect(trace.riverTracer.catchment).toEqual({ status, reason: "NoPublishedCatchment" });
  }
});

test.each([
  (body) => { body.type = "Unknown"; },
  (body) => { body.riverTracer.schema = "v2"; },
  (body) => { body.riverTracer.releaseVersion = "f".repeat(64); },
  (body) => { body.riverTracer.canonicalSample.sampleId = "1"; },
  (body) => { body.riverTracer.match.reachId = "1"; },
  (body) => { body.riverTracer.network.archiveSha256 = null; },
  (body) => { body.riverTracer.attribution = ""; },
  (body) => { body.riverTracer.licence = null; },
  (body) => { body.riverTracer.route.completeness = "probably"; },
  (body) => { body.riverTracer.route.direction = "downstream"; },
  (body) => { body.riverTracer.summary = null; },
  (body) => { body.riverTracer.catchment.areaKm2 = null; },
  (body) => { body.riverTracer.catchment.pourPointOffsetM = -1; },
  (body) => { body.features[0].geometry.coordinates[0][0] = 181; },
  (body) => { body.features[0].geometry.type = "GeometryCollection"; },
])("malformed or mixed-release trace fails closed (%#)", (mutate) => {
  const body = clone(fixture.upstream);
  mutate(body);
  expect(() => parseRiverTrace(body, located(), "upstream")).toThrow("RESPONSE_CONTRACT_ERROR");
});

test("producer links cannot redirect a signed request to another host or stage", () => {
  const body = clone(fixture.locate);
  body.data.links.upstream = "https://attacker.example/production";
  expect(riverSamplePath(parseRiverLocation(body), "upstream", "none")).toBe(fixture.locate.data.links.upstream);
  const bad = located(); bad.basinId = "../production";
  expect(() => riverSamplePath(bad, "downstream", "none")).toThrow("INVALID_QUERY");
});

test.each([{}, { data: null }, { data: { ...fixture.locate.data, sample: { ...fixture.locate.data.sample, snapOffsetM: null } } },
  { data: { ...fixture.locate.data, match: { ...fixture.locate.data.match, candidates: [null] } } },
])("malformed locate fails closed", (body) => {
  expect(() => parseRiverLocation(body)).toThrow("RESPONSE_CONTRACT_ERROR");
});

test("decoded/chunked response size is bounded before JSON parse and cancels the stream", async () => {
  const cancel = jest.fn().mockResolvedValue();
  const stream = { read: jest.fn().mockResolvedValueOnce({ value: new Uint8Array(RIVER_MAX_BYTES), done: false })
    .mockResolvedValueOnce({ value: new Uint8Array(1), done: false }), cancel, releaseLock: jest.fn() };
  await expect(readRiverJson({ body: { getReader: () => stream } })).rejects.toMatchObject({ code: "RESULT_TOO_LARGE" });
  expect(cancel).toHaveBeenCalledTimes(1);
  await expect(readRiverJson(new Response("not JSON"))).rejects.toThrow();
});

test.each(["NoMatch", "Ambiguous", "OutOfCoverage"])("%s never requests or fabricates a trace", async (status) => {
  const client = reader();
  const value = clone(fixture.locate);
  value.data = { ...value.data, match: { status, reason: "FixtureUncertainty", candidates: [] }, sample: null, links: null };
  client.locateRiver.mockResolvedValue(parseRiverLocation(value));
  expect(await getHppRiverContext("upstream", "reaches", { client })).toMatchObject({ status, trace: null });
  expect(client.getRiverTrace).not.toHaveBeenCalled();
});

test.each([
  (value) => { value.match.reachName = "Canal"; },
  (value) => { value.match.reachId = "99"; },
  (value) => { value.release.version = "a".repeat(64); },
  (value) => { value.sample.sampleId = "99"; },
  (value) => { value.sample.snapOffsetM = 501; },
  (value) => { value.sample = null; },
])("a changed/unreviewed anchor cannot silently route (%#)", async (mutate) => {
  const client = reader(); const value = located(); mutate(value); client.locateRiver.mockResolvedValue(value);
  await expect(getHppRiverContext("downstream", "reaches", { client })).rejects.toMatchObject({ code: "ANCHOR_REVIEW_REQUIRED" });
  expect(client.getRiverTrace).not.toHaveBeenCalled();
});

test("large geometry falls back once on the same release/sample with catchment evidence", async () => {
  const client = reader(); client.getRiverTrace.mockRejectedValueOnce(new RdpError("RESULT_TOO_LARGE", 413));
  const result = await getHppRiverContext("upstream", "reaches", { client });
  expect(result).toMatchObject({ status: "available", geometry: "none", fallback: "geometry-too-large" });
  expect(result.trace.features).toEqual([]);
  expect(result.trace.riverTracer.catchment.status).toBe("published");
  expect(client.getRiverTrace.mock.calls.map((call) => call.slice(1))).toEqual([["upstream", "reaches"], ["upstream", "none"]]);
  expect(client.locateRiver).toHaveBeenCalledWith(HPP_RIVER_ANCHOR);
});

test("an oversized summary fails boundedly; unrelated errors never trigger geometry fallback", async () => {
  for (const code of ["RESULT_TOO_LARGE", "DATA_INTEGRITY", "TIMEOUT", "AUTHORIZATION_FAILED", "NETWORK_ERROR"]) {
    const client = reader(); client.getRiverTrace.mockRejectedValue(new RdpError(code));
    await expect(getHppRiverContext("upstream", "none", { client })).rejects.toMatchObject({ code });
    expect(client.getRiverTrace).toHaveBeenCalledTimes(1);
  }
});

test("a retired release re-locates once and never loops", async () => {
  const client = reader(); client.getRiverTrace.mockRejectedValue(new RdpError("RELEASE_NOT_AVAILABLE", 410));
  await expect(getHppRiverContext("downstream", "reaches", { client })).rejects.toMatchObject({ code: "RELEASE_NOT_AVAILABLE" });
  expect(client.locateRiver).toHaveBeenCalledTimes(2);
  expect(client.getRiverTrace).toHaveBeenCalledTimes(2);
});

test("local fixtures run through the parser with no AWS client", async () => {
  expect(await getHppRiverContext("upstream", "none", { fixtures: true })).toMatchObject({ source: "fixture", status: "available" });
  expect(createRdpClient).not.toHaveBeenCalled();
});

test.each([{}, { NODE_ENV: "production", HPP_RIVER_FIXTURES: "1" },
  ...["production", "preview", "development"].map((VERCEL_ENV) => ({ NODE_ENV: "development", VERCEL_ENV, HPP_RIVER_FIXTURES: "1" })),
])("fixture mode cannot be enabled on Vercel or outside local development", (env) => {
  expect(hppRiverFixturesEnabled(env)).toBe(false);
});
