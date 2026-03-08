const {
  __resetTrentWeirsSnapshotCacheForTests,
  getTrentWeirsSnapshot,
} = require("../libs/services/trentWeirsService");

function buildReadings(measureType, startValue) {
  return Array.from({ length: 100 }, (_, index) => ({
    measure: `https://environment.data.gov.uk/flood-monitoring/id/measures/test-${measureType}`,
    dateTime: new Date(Date.UTC(2026, 2, 8, 12, 0, 0) - index * 15 * 60 * 1000).toISOString(),
    value: startValue - index * 0.01,
  }));
}

function buildPayload(stationId) {
  const levelReadings = buildReadings("level", 1 + stationId / 10000);

  if (stationId === 4007) {
    return {
      items: [...levelReadings, ...buildReadings("flow", 50)],
    };
  }

  return { items: levelReadings };
}

describe("trentWeirsService", () => {
  beforeEach(() => {
    __resetTrentWeirsSnapshotCacheForTests();
    globalThis.fetch = jest.fn((url) => {
      const stationId = Number(url.match(/stations\/(\d+)/)?.[1]);
      const measureType = url.includes("parameter=flow") ? "flow" : "level";
      const payload = buildPayload(stationId);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: payload.items.filter((item) => item.measure.includes(`test-${measureType}`)),
        }),
      });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("getTrentWeirsSnapshot returns aggregated station data", async () => {
    const result = await getTrentWeirsSnapshot();

    expect(result.fallback).toBe(false);
    expect(result.partial).toBe(false);
    expect(result.stations).toHaveLength(5);
    expect(result.stations.find((station) => station.stationId === 4007).measures.flow.latestValue).toBe(50);
    expect(result.stations.find((station) => station.stationId === 4009).measures.level.rateOfChangeHour).toBe(4);
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/stations/4009/readings?_sorted&_limit=672&parameter=level"),
      { next: { revalidate: 900 } }
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/stations/4007/readings?_sorted&_limit=672&parameter=flow"),
      { next: { revalidate: 900 } }
    );
  });

  test("getTrentWeirsSnapshot falls back to the last successful snapshot on later failure", async () => {
    const firstSnapshot = await getTrentWeirsSnapshot();

    globalThis.fetch.mockRejectedValue(new Error("upstream unavailable"));

    const fallbackSnapshot = await getTrentWeirsSnapshot();

    expect(fallbackSnapshot.fallback).toBe(true);
    expect(fallbackSnapshot.partial).toBe(false);
    expect(fallbackSnapshot.stations).toEqual(firstSnapshot.stations);
  });

  test("getTrentWeirsSnapshot returns a partial fallback payload before a cache exists", async () => {
    globalThis.fetch = jest.fn((url) => {
      const stationId = Number(url.match(/stations\/(\d+)/)?.[1]);
      const measureType = url.includes("parameter=flow") ? "flow" : "level";

      if (stationId === 4007 && measureType === "flow") {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      }

      const payload = buildPayload(stationId);

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          items: payload.items.filter((item) => item.measure.includes(`test-${measureType}`)),
        }),
      });
    });

    const result = await getTrentWeirsSnapshot();

    expect(result.fallback).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.stations).toHaveLength(4);
  });
});
