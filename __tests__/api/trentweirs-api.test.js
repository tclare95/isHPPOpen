jest.mock("../../libs/services/trentWeirsService");

const {
  buildEmptyTrentWeirsPayload,
  getTrentWeirsSnapshot,
} = require("../../libs/services/trentWeirsService");
const { GET, revalidate } = require("../../app/api/trentweirs/route");

describe("Trent weirs API route handler", () => {
  beforeEach(() => jest.clearAllMocks());

  test("exports the standard operational revalidate window", () => {
    expect(revalidate).toBe(900);
  });

  test("GET returns the Trent snapshot", async () => {
    getTrentWeirsSnapshot.mockResolvedValue({
      generatedAt: "2026-03-08T12:00:00.000Z",
      fallback: false,
      partial: false,
      stations: [{ stationId: 4009, name: "Colwick", measures: { level: { latestValue: 1.2 } } }],
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.stations[0].stationId).toBe(4009);
  });

  test("GET returns an empty fallback payload when the service fails", async () => {
    getTrentWeirsSnapshot.mockRejectedValue(new Error("boom"));
    buildEmptyTrentWeirsPayload.mockReturnValue({
      generatedAt: null,
      fallback: true,
      partial: false,
      stations: [],
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.fallback).toBe(true);
    expect(payload.data.stations).toEqual([]);
  });
});
