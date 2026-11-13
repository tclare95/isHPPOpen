/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

import { GET } from "../../app/api/waterquality/river/impact/route";
import { createRdpClient } from "../../libs/rdp/client";
import { RdpError } from "../../libs/rdp/errors";
import { parseRiverImpact } from "../../libs/rdp/riverImpact";
import { impactBody, IMPACT_SET } from "../../testUtils/rdpImpactFixtures";

const originalEnv = process.env;
const getRiverImpact = jest.fn();
const get = (query = "") => GET(new Request(`http://localhost:3000/api/waterquality/river/impact${query}`));
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv, RDP_RIVER_IMPACT: "on" };
  createRdpClient.mockReturnValue({ getRiverImpact });
  getRiverImpact.mockImplementation(async (set, { hours }) => parseRiverImpact(impactBody({ hours }), set, hours));
});
afterEach(() => { process.env = originalEnv; });

test("is off by default and reads nothing", async () => {
  delete process.env.RDP_RIVER_IMPACT;
  const response = await get();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, data: { enabled: false } });
  expect(response.headers["Cache-Control"]).toBe("public, s-maxage=60");
  expect(getRiverImpact).not.toHaveBeenCalled();
});

test("serves the reviewed HPP set's impact, shared briefly through the CDN", async () => {
  const response = await get("?hours=24");
  expect(response.status).toBe(200);
  expect(response.headers["Cache-Control"]).toBe("public, s-maxage=120, stale-while-revalidate=180");
  const { data } = await response.json();
  expect(data).toMatchObject({ enabled: true, status: "available", set: IMPACT_SET, impact: { windowHours: 24 } });
  expect(data.impact.outfalls.map((o) => o.externalId)).toEqual(["SVT00001", "SVT00002"]);
  expect(getRiverImpact).toHaveBeenCalledWith(IMPACT_SET, { hours: 24 });
});

test("concurrent requests in one instance share a single RDP read", async () => {
  let release;
  getRiverImpact.mockImplementation((set, { hours }) => new Promise((resolve) => { release = () => resolve(parseRiverImpact(impactBody({ hours }), set, hours)); }));
  const pending = [get(), get(), get()];
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const responses = await Promise.all(pending);
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  expect(getRiverImpact).toHaveBeenCalledTimes(1);
});

test.each(["?hours=12", "?hours=x", "?set=bath-avon", "?hours=48&hours=24"])("rejects %s before any read", async (query) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect(getRiverImpact).not.toHaveBeenCalled();
});

test.each([
  ["a re-published relationship set", { version: "c".repeat(64) }],
  ["another network release", { networkVersion: "d".repeat(64) }],
])("refuses %s until it is reviewed here", async (_, override) => {
  getRiverImpact.mockImplementation(async (set, { hours }) => parseRiverImpact(impactBody({ hours, ...override }), set, hours));
  const response = await get();
  expect(response.status).toBe(503);
  expect(response.headers["Cache-Control"]).toBe("private, no-store");
});

test.each(["CSO_UNAVAILABLE", "RESPONSE_CONTRACT_ERROR", "TIMEOUT"])("an RDP %s is unavailable, never an empty layer", async (code) => {
  getRiverImpact.mockRejectedValue(new RdpError(code, 503));
  const response = await get();
  expect(response.status).toBe(503);
  expect(response.headers["Cache-Control"]).toBe("private, no-store");
  expect(await response.json()).toEqual({ ok: false, error: { message: "Downstream impact is temporarily unavailable" } });
});
