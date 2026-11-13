/** @jest-environment node */
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient } from "@aws-sdk/client-sts";
import { createRdpClient } from "../libs/rdp/client";
import { RDP_STAGING_API_URL } from "../libs/rdp/config";
import { parseRiverImpact, RIVER_IMPACT_MAX_BYTES } from "../libs/rdp/riverImpact";
import { asset, impactBody, IMPACT_SET } from "../testUtils/rdpImpactFixtures";

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
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  getVercelOidcToken.mockResolvedValue("token");
  STSClient.mockImplementation(() => ({ send: jest.fn().mockResolvedValue({ Credentials: {
    AccessKeyId: "ASIAFIXTURE", SecretAccessKey: "secret", SessionToken: "session", Expiration: new Date(Date.now() + 900000),
  } }) }));
});
afterEach(() => { global.fetch = originalFetch; });

describe("parseRiverImpact", () => {
  it("keeps only drawn outfalls with their event, observation time and route, and explains every reach", () => {
    const impact = parseRiverImpact(impactBody(), IMPACT_SET, 48);
    expect(impact.outfalls.map((o) => [o.externalId, o.impact, o.latestEvent?.eventId, o.route?.completeness])).toEqual([
      ["SVT00001", "active", "cse_000000000000000000000001", "complete"],
      ["SVT00002", "recent", "cse_000000000000000000000002", "incomplete"],
    ]);
    expect(impact.outfalls[0].statusFetchedAt).toBe("2026-11-13T11:58:00Z");
    // Unknown is counted, never drawn and never listed as clear.
    expect(impact.counts.unknown).toBe(1);
    expect(impact.outfalls.some((o) => o.externalId === "SVT00003")).toBe(false);
    expect(impact.reaches.features).toHaveLength(3);
    expect(impact.reaches.features[1].properties.contributors).toEqual({ active: [asset("SVT00001")], unresolved: [], recent: [asset("SVT00002")] });
    expect(impact).toMatchObject({ asOf: "2026-11-13T12:00:00Z", windowHours: 48, publication: { refreshSeconds: 300 },
      relationships: { setId: IMPACT_SET, approval: "approved" }, network: { id: "orn-v2-gb" } });
  });

  const broken = {
    "wrong schema": (b) => { b.riverTracer.schema = "rdp.river-tracer.route/v1"; },
    "another set": (b) => { b.riverTracer.relationships.setId = "bath-avon"; },
    "another window": (b) => { b.riverTracer.windowHours = 24; },
    "unknown impact state": (b) => { b.features[0].properties.impact = "clear"; },
    "reach credited to an undrawn outfall": (b) => { b.features[3].properties.activeContributors = [asset("SVT00003")]; },
    "reach state not its contributors' precedence": (b) => { b.features[4].properties.impact = "recent"; },
    "routed outfall without a route": (b) => { delete b.riverTracer.routes[asset("SVT00001")]; },
    "multi-line geometry": (b) => { b.features[3].geometry = { type: "MultiLineString", coordinates: [] }; },
    "unexpected feature kind": (b) => { b.features[0].properties.kind = "catchment"; },
    "missing counts": (b) => { delete b.riverTracer.counts.unknown; },
  };
  it.each(Object.keys(broken))("refuses %s rather than drawing a guess", (name) => {
    const body = impactBody();
    broken[name](body);
    expect(() => parseRiverImpact(body, IMPACT_SET, 48)).toThrow("RESPONSE_CONTRACT_ERROR");
  });
});

describe("client.getRiverImpact", () => {
  it("signs one bounded GET for the set and window and parses it", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(impactBody({ hours: 24 }))));
    const impact = await createRdpClient(preview).getRiverImpact(IMPACT_SET, { hours: 24 });
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/staging/v1/river/impact/hpp-upstream-outfalls");
    expect(url.searchParams.get("hours")).toBe("24");
    expect(global.fetch.mock.calls[0][1].headers.authorization).toMatch(/^AWS4-HMAC-SHA256/);
    expect(impact.windowHours).toBe(24);
  });

  it("validates the query before any network or credential use", () => {
    const client = createRdpClient(preview);
    for (const [set, hours] of [["Bad_Set", 48], [IMPACT_SET, 12], [IMPACT_SET, "48"]]) {
      expect(() => client.getRiverImpact(set, { hours })).toThrow("INVALID_QUERY");
    }
    expect(getVercelOidcToken).not.toHaveBeenCalled();
  });

  it("maps RDP's impact refusals to fixed codes and caps the decoded body", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "IMPACT_NOT_CONFIGURED" } }), { status: 404 }));
    await expect(createRdpClient(preview).getRiverImpact(IMPACT_SET)).rejects.toMatchObject({ code: "IMPACT_NOT_CONFIGURED", status: 404 });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "CSO_UNAVAILABLE" } }), { status: 503 }));
    await expect(createRdpClient(preview).getRiverImpact(IMPACT_SET)).rejects.toMatchObject({ code: "CSO_UNAVAILABLE" });
    global.fetch = jest.fn().mockImplementation(() => Promise.resolve(new Response("x".repeat(RIVER_IMPACT_MAX_BYTES + 1))));
    await expect(createRdpClient(preview).getRiverImpact(IMPACT_SET)).rejects.toMatchObject({ code: "RESULT_TOO_LARGE" });
  });
});
