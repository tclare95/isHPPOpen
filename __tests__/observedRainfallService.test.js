/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ unstable_cache: jest.fn((fn) => fn) }));
jest.mock("../libs/rdp/client", () => ({ createRdpClient: jest.fn() }));

import { createRdpClient } from "../libs/rdp/client";
import { RdpError } from "../libs/rdp/errors";
import { parseRainfallHistory, parseRainfallLatest } from "../libs/rdp/rainfallContract";
import { getObservedRainfallContext, RAINFALL_RANGE_MS } from "../libs/services/observedRainfallService";
import { GET } from "../app/api/rainfall/observed/route";
import { historyBody, latestBody, latestRow, PERIOD_MS, rainfallRow, rdpWindow, RAINFALL_IDS } from "../testUtils/rdpRainfallFixtures";

const NOW = new Date(Date.UTC(2026, 10, 18, 12, 40));
const TO = Date.UTC(2026, 10, 18, 12, 45); // next 15-minute boundary after NOW
const FROM = TO - RAINFALL_RANGE_MS;
const LATEST = Date.UTC(2026, 10, 18, 11, 45); // typical ~1 h EA telemetry lag

// Every label from FROM to LATEST reported as 0 mm, with per-label overrides (null = absent).
function rows(id, overrides = {}) {
  const out = [];
  for (let label = FROM; label <= LATEST; label += PERIOD_MS) {
    const override = overrides[label];
    if (override === null) continue;
    out.push(override ?? rainfallRow(id, label, 0));
  }
  return out;
}

function fakeClient({ history = {}, latest } = {}) {
  return {
    getRainfallLatest: jest.fn(async (ids) => latest ? latest(ids) : parseRainfallLatest(latestBody(ids.map((id) => latestRow(id, LATEST))), ids)),
    getRainfallObservations: jest.fn(async (id, query) => {
      expect(query).toMatchObject({ from: new Date(FROM).toISOString(), to: new Date(TO).toISOString(), limit: 1000 });
      if (history[id]) return history[id](query);
      const data = rows(id);
      return parseRainfallHistory(historyBody(id, data, { fromMs: FROM, toMs: TO }), id);
    }),
  };
}

describe("getObservedRainfallContext", () => {
  it("reads six gauges over one bounded range and summarises each to its newest report", async () => {
    const client = fakeClient({ history: {
      "ea-stone-rainfall": () => {
        const data = rows("ea-stone-rainfall", { [LATEST]: rainfallRow("ea-stone-rainfall", LATEST, 1.4), [LATEST - PERIOD_MS]: rainfallRow("ea-stone-rainfall", LATEST - PERIOD_MS, 0.6) });
        return parseRainfallHistory(historyBody("ea-stone-rainfall", data, { fromMs: FROM, toMs: TO }), "ea-stone-rainfall");
      },
    } });
    const payload = await getObservedRainfallContext({ now: NOW, client });
    expect(client.getRainfallObservations).toHaveBeenCalledTimes(6);
    expect(client.getRainfallLatest).toHaveBeenCalledWith(RAINFALL_IDS);
    expect(payload).toMatchObject({ status: "available", range: { from: new Date(FROM).toISOString(), to: new Date(TO).toISOString() }, windowHours: [6, 24, 72] });
    const stone = payload.gauges.find((gauge) => gauge.measurementId === "ea-stone-rainfall");
    expect(stone).toMatchObject({ status: "available", unit: "mm", periodMinutes: 15, windowsEndAt: new Date(LATEST).toISOString(), pending: 3, revised: 0 });
    expect(stone.windows.map((w) => [w.hours, w.status, w.totalMm])).toEqual([[6, "complete", 2], [24, "complete", 2], [72, "complete", 2]]);
    // RDP sees the whole requested range, including the three undelivered labels, as incomplete.
    expect(stone.rangeSummary).toMatchObject({ status: "incomplete", absent: 3 });
    expect(stone.latest).toMatchObject({ labelConvention: "unverified", periodStart: null, freshness: "stale" });
  });

  it("keeps a gauge with absent and ineligible intervals incomplete, with a lower bound, gaps and revisions", async () => {
    const id = "ea-wanlip-rainfall";
    const client = fakeClient({ history: { [id]: () => {
      const data = rows(id, {
        [LATEST - 2 * PERIOD_MS]: null,
        [LATEST - PERIOD_MS]: rainfallRow(id, LATEST - PERIOD_MS, 0, { eligible: false, quality: "Suspect", ineligibleReason: "QualitySuspect" }),
        [LATEST]: rainfallRow(id, LATEST, 0.4, { revision: 2 }),
      });
      return parseRainfallHistory(historyBody(id, data, { fromMs: FROM, toMs: TO }), id);
    } } });
    const wanlip = (await getObservedRainfallContext({ now: NOW, client })).gauges.find((gauge) => gauge.measurementId === id);
    expect(wanlip.windows[0]).toMatchObject({ status: "incomplete", totalMm: null, reportedMm: 0.4, missing: 2, ineligible: 1 });
    expect(wanlip.gaps.map((gap) => gap.reason)).toEqual(["absent", "ineligible"]);
    expect(wanlip.revised).toBe(1);
  });

  it("reports one failing gauge as unavailable with a coarse reason, never as dry, and keeps the rest", async () => {
    const client = fakeClient({ history: { "ea-ashbourne-rainfall": async () => { throw new RdpError("MEASUREMENT_NOT_FOUND", 404); } } });
    const payload = await getObservedRainfallContext({ now: NOW, client });
    expect(payload.status).toBe("partial");
    const ashbourne = payload.gauges.find((gauge) => gauge.measurementId === "ea-ashbourne-rainfall");
    expect(ashbourne).toEqual(expect.objectContaining({ status: "unavailable", unavailableReason: "not_published" }));
    expect(ashbourne.windows).toBeUndefined();
    expect(payload.gauges.filter((gauge) => gauge.status === "available")).toHaveLength(5);
  });

  it("refuses a gauge whose rows disagree with RDP's own window summary", async () => {
    const id = "ea-stone-rainfall";
    const client = fakeClient({ history: { [id]: () => {
      const data = rows(id);
      const window = { ...rdpWindow(data, FROM, TO), reported: data.length + 1, eligible: data.length + 1, absent: 2 };
      return parseRainfallHistory(historyBody(id, data, { fromMs: FROM, toMs: TO, window }), id);
    } } });
    const stone = (await getObservedRainfallContext({ now: NOW, client })).gauges.find((gauge) => gauge.measurementId === id);
    expect(stone).toMatchObject({ status: "unavailable", unavailableReason: "invalid_response" });
  });

  it("follows a paginated read, applying the same rules locally when RDP withholds its window", async () => {
    const id = "ea-lea-marston-rainfall";
    const all = rows(id);
    const client = fakeClient({ history: { [id]: ({ cursor }) => cursor === undefined
      ? parseRainfallHistory(historyBody(id, all.slice(0, 200), { fromMs: FROM, toMs: TO, window: null, nextCursor: "page2" }), id)
      : parseRainfallHistory(historyBody(id, all.slice(200), { fromMs: FROM, toMs: TO, window: null }), id) } });
    const gauge = (await getObservedRainfallContext({ now: NOW, client })).gauges.find((g) => g.measurementId === id);
    expect(client.getRainfallObservations).toHaveBeenCalledWith(id, expect.objectContaining({ cursor: "page2" }));
    expect(gauge).toMatchObject({ status: "available", rangeSummary: null, rangeSummaryUnavailable: "paginated" });
    expect(gauge.windows[2]).toMatchObject({ status: "complete", totalMm: 0 });
  });

  it("refuses overlapping pages", async () => {
    const id = "ea-lea-marston-rainfall";
    const all = rows(id);
    const client = fakeClient({ history: { [id]: ({ cursor }) => parseRainfallHistory(historyBody(id, cursor ? all.slice(100) : all.slice(0, 200),
      { fromMs: FROM, toMs: TO, window: null, nextCursor: cursor ? null : "page2" }), id) } });
    const gauge = (await getObservedRainfallContext({ now: NOW, client })).gauges.find((g) => g.measurementId === id);
    expect(gauge).toMatchObject({ status: "unavailable", unavailableReason: "invalid_response" });
  });

  it("still summarises history when the latest read fails, and says when a gauge has no recent data", async () => {
    const client = fakeClient({
      latest: async () => { throw new RdpError("THROTTLED", 429); },
      history: { "ea-ashford-rainfall": async () => parseRainfallHistory(historyBody("ea-ashford-rainfall", [], { fromMs: FROM, toMs: TO }), "ea-ashford-rainfall") },
    });
    const payload = await getObservedRainfallContext({ now: NOW, client });
    expect(payload.status).toBe("available");
    expect(payload.gauges[0]).toMatchObject({ latest: null, latestReportedLabel: new Date(LATEST).toISOString() });
    expect(payload.gauges.find((g) => g.measurementId === "ea-ashford-rainfall")).toMatchObject({ status: "no_recent_data", latestReportedLabel: null });
  });

  it("reports everything unavailable when every read fails", async () => {
    const fail = async () => { throw new RdpError("AUTHORIZATION_FAILED", 403); };
    const client = fakeClient({ latest: fail, history: Object.fromEntries(RAINFALL_IDS.map((id) => [id, fail])) });
    const payload = await getObservedRainfallContext({ now: NOW, client });
    expect(payload).toMatchObject({ status: "unavailable", unavailableReason: "not_authorised" });
  });
});

describe("GET /api/rainfall/observed", () => {
  const get = (query = "") => GET(new Request(`http://localhost:3000/api/rainfall/observed${query}`));
  let warn;
  // The service keeps one client per instance, so the mock delegates to whichever fake a test installs.
  let current;
  const use = (client) => { current = client; return client; };
  createRdpClient.mockReturnValue({
    getRainfallLatest: (...args) => current.getRainfallLatest(...args),
    getRainfallObservations: (...args) => current.getRainfallObservations(...args),
  });
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ["setTimeout", "clearTimeout", "setImmediate", "nextTick", "queueMicrotask"] });
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { jest.useRealTimers(); warn.mockRestore(); });

  it("serves a fully available answer for one 15-minute bucket", async () => {
    use(fakeClient());
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=900, stale-while-revalidate=300");
    const { data } = await response.json();
    expect(data.gauges).toHaveLength(6);
  });

  it("caches a partial or unavailable answer only briefly and logs only coarse reasons", async () => {
    use(fakeClient({ history: { "ea-stone-rainfall": async () => { throw new RdpError("TIMEOUT"); } } }));
    const response = await get();
    expect(response.headers["Cache-Control"]).toBe("public, s-maxage=60");
    expect((await response.json()).data.status).toBe("partial");
    expect(warn).toHaveBeenCalledWith(expect.any(String), { status: "partial", reasons: ["temporarily_unavailable"] });
  });

  it("is not a general proxy: query parameters are refused before any read", async () => {
    const client = use(fakeClient());
    const response = await get("?ids=ea-colwick-level");
    expect(response.status).toBe(400);
    expect(client.getRainfallObservations).not.toHaveBeenCalled();
  });
});

describe("unconfigured environment", () => {
  it("reports not_configured without reading", async () => {
    jest.resetModules();
    jest.doMock("../libs/rdp/client", () => ({ createRdpClient: jest.fn(() => { throw new (jest.requireActual("../libs/rdp/errors").RdpError)("CONFIGURATION_ERROR"); }) }));
    const { getObservedRainfallContext: fresh } = await import("../libs/services/observedRainfallService");
    const payload = await fresh({ now: NOW });
    expect(payload).toMatchObject({ status: "unavailable", unavailableReason: "not_configured", range: null });
    expect(payload.gauges.every((gauge) => gauge.status === "unavailable" && !gauge.windows)).toBe(true);
  });
});
