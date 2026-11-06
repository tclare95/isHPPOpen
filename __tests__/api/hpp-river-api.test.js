/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("../../libs/services/hppRiverService", () => {
  const actual = jest.requireActual("../../libs/services/hppRiverService");
  return { ...actual, getHppRiverContext: jest.fn(actual.getHppRiverContext) };
});
jest.mock("../../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

import { GET } from "../../app/api/waterquality/river/route";
import { createRdpClient } from "../../libs/rdp/client";
import { RdpError } from "../../libs/rdp/errors";
import { getHppRiverContext } from "../../libs/services/hppRiverService";

const originalEnv = process.env;
const get = (query = "") => GET(new Request(`http://localhost:3000/api/waterquality/river${query}`));
beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv, NODE_ENV: "development", HPP_RIVER_FIXTURES: "1" };
  delete process.env.VERCEL_ENV;
});
afterEach(() => { process.env = originalEnv; });

test.each(["upstream", "downstream"])("local %s fixtures work through the shared envelope with no AWS", async (direction) => {
  const response = await get(`?direction=${direction}&geometry=none`);
  expect(response.status).toBe(200);
  expect(response.headers["Cache-Control"]).toBe("private, no-store");
  expect(await response.json()).toMatchObject({ ok: true, data: {
    direction, source: "fixture", status: "available", geometry: "none", trace: { features: [] },
  } });
  expect(createRdpClient).not.toHaveBeenCalled();
});

test.each([
  {}, { NODE_ENV: "production" }, { VERCEL_ENV: "development", HPP_RIVER_FIXTURES: "0" }, { HPP_RIVER_FIXTURES: "0" },
])("unconfigured local access is blocked before any read (%j)", async (overrides) => {
  if (Object.keys(overrides).length === 0) delete process.env.HPP_RIVER_FIXTURES;
  Object.assign(process.env, overrides);
  const response = await get();
  expect(response.status).toBe(404);
  expect(response.headers["Cache-Control"]).toBe("private, no-store");
  expect(getHppRiverContext).not.toHaveBeenCalled();
});

test.each(["preview", "production"])("%s serves the live consumer and never selects fixtures", async (stage) => {
  process.env.VERCEL_ENV = stage;
  getHppRiverContext.mockResolvedValueOnce({ status: "available", source: "river-data-platform" });
  const response = await get("?direction=downstream");
  expect(response.status).toBe(200);
  expect(getHppRiverContext).toHaveBeenCalledWith("downstream", "reaches", { fixtures: false });
  expect(response.headers["Cache-Control"]).toBe("public, s-maxage=86400, stale-while-revalidate=3600");
});

test.each(["?lon=-1", "?lat=52", "?path=/v1/measurements", "?url=https://example.com", "?release=abc",
  "?direction=sideways", "?geometry=all", "?direction=upstream&direction=downstream", "?geometry=none&geometry=reaches",
])("arbitrary/invalid query %s never reaches the reader", async (query) => {
  expect((await get(query)).status).toBe(400);
  expect(getHppRiverContext).not.toHaveBeenCalled();
});

test.each(["AUTHENTICATION_FAILED", "AUTHORIZATION_FAILED", "DATA_INTEGRITY", "TIMEOUT", "NETWORK_ERROR", "RESULT_TOO_LARGE", "ANCHOR_REVIEW_REQUIRED"])(
  "%s never exposes internal details", async (code) => {
    getHppRiverContext.mockRejectedValueOnce(new RdpError(code, 503));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: { message: "River context is temporarily unavailable" } });
  });

test("unexpected errors are redacted by the existing API error mapper", async () => {
  getHppRiverContext.mockRejectedValueOnce(new Error("secret AWS token and private bucket"));
  const response = await get();
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ ok: false, error: { message: "Internal Server Error" } });
});
