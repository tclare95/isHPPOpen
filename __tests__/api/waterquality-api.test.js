jest.mock('../../libs/services/waterQualityService');

const {
  getPublicWaterQualitySnapshot,
  getWaterQualityDensitySeries,
  getPublicCsoDetailsByIds,
  getPublicCsoDetailsById,
} = require('../../libs/services/waterQualityService');
const { HttpError } = require('../../libs/api/http');
const { GET: getWaterQuality } = require('../../app/api/waterquality/route');
const { GET: getCsoDensity } = require('../../app/api/waterquality/csodensity/route');
const { GET: getBulkCso } = require('../../app/api/waterquality/cso/route');
const { GET: getSingleCso } = require('../../app/api/waterquality/cso/[id]/route');

describe('Water quality API route handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('water quality GET returns latest snapshot', async () => {
    getPublicWaterQualitySnapshot.mockResolvedValue({
      Id: 'wq-1',
      ActiveCSOCount: 2,
    });

    const res = await getWaterQuality();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.waterQualityData).toEqual({ Id: 'wq-1', ActiveCSOCount: 2 });
  });

  test('csodensity GET passes parsed hours to service', async () => {
    getWaterQualityDensitySeries.mockResolvedValue([{ timestamp: '2026-03-08T10:00:00Z', numberCSOsPerKm2: 1.2 }]);

    const res = await getCsoDensity({
      nextUrl: {
        searchParams: new URLSearchParams('hours=24'),
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual([{ timestamp: '2026-03-08T10:00:00Z', numberCSOsPerKm2: 1.2 }]);
    expect(getWaterQualityDensitySeries).toHaveBeenCalledWith(24, expect.any(Date), 15);
  });

  test('csodensity validates hours and interval', async () => {
    const res = await getCsoDensity({ nextUrl: { searchParams: new URLSearchParams('hours=9000&interval=30') } });
    expect(res.status).toBe(400);
    expect(getWaterQualityDensitySeries).not.toHaveBeenCalled();
  });

  test('csodensity requests hourly aggregation', async () => {
    getWaterQualityDensitySeries.mockResolvedValue([]);
    const res = await getCsoDensity({ nextUrl: { searchParams: new URLSearchParams('hours=120&interval=60') } });
    expect(res.status).toBe(200);
    expect(getWaterQualityDensitySeries).toHaveBeenCalledWith(120, expect.any(Date), 60);
  });

  test('bulk cso GET returns 400 when ids are missing', async () => {
    const res = await getBulkCso({
      nextUrl: {
        searchParams: new URLSearchParams(),
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error.message).toBe('Missing ids query parameter');
    expect(getPublicCsoDetailsByIds).not.toHaveBeenCalled();
  });

  test('bulk cso GET returns service data', async () => {
    getPublicCsoDetailsByIds.mockResolvedValue({
      CSO1: { Id: 'CSO1', Status: 1 },
    });

    const res = await getBulkCso({
      nextUrl: {
        searchParams: new URLSearchParams('ids=CSO1,CSO2'),
      },
    });
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.csoData).toEqual({ CSO1: { Id: 'CSO1', Status: 1 } });
    expect(getPublicCsoDetailsByIds).toHaveBeenCalledWith(['CSO1', 'CSO2']);
  });

  test('single cso GET returns service data', async () => {
    getPublicCsoDetailsById.mockResolvedValue({ Id: 'CSO1', Status: 1 });

    const res = await getSingleCso(
      {},
      {
        params: Promise.resolve({ id: 'CSO1' }),
      }
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual({ Id: 'CSO1', Status: 1 });
    expect(getPublicCsoDetailsById).toHaveBeenCalledWith('CSO1');
  });

  test('single cso GET maps service errors', async () => {
    getPublicCsoDetailsById.mockRejectedValue(new HttpError(404, 'CSO data not found'));

    const res = await getSingleCso(
      {},
      {
        params: Promise.resolve({ id: 'missing' }),
      }
    );
    const payload = await res.json();

    expect(res.status).toBe(404);
    expect(payload.error.message).toBe('CSO data not found');
  });

  // #120: the route must pass the service result through untouched in every RDP_CSO_SOURCE mode.
  test('water quality GET passes RDP-mode snapshots through with the public envelope', async () => {
    const snapshot = {
      Id: 'wq-1', ScrapeTimestamp: '2026-11-12T11:50:00.000Z', ActiveCSOCount: 1, ActiveCSOIds: ['SVT1'],
      WaterQuality: { NumberUpstreamCSOs: 4, NumberCSOsPerKm2: 0.04, CSOIds: ['SVT1'], CSOActiveTime: 4 },
      statusSummary: { currentlySpilling: 1, recentlyStopped48h: 0, offline: 0, unknown: 0 },
      locations: [{ id: 'SVT1', status: 'active', statusReason: 'spilling' }],
      health: { source: 'river-data-platform-cso', state: 'fresh', cso: { origin: 'rdp' } },
    };
    getPublicWaterQualitySnapshot.mockResolvedValue(snapshot);
    const payload = await (await getWaterQuality()).json();
    expect(payload).toEqual({ ok: true, data: { waterQualityData: snapshot } });
  });

  test('bulk cso GET maps RDP unavailability and id limits to fixed messages', async () => {
    getPublicCsoDetailsByIds.mockRejectedValueOnce(new HttpError(503, 'CSO data temporarily unavailable'));
    let res = await getBulkCso({ nextUrl: { searchParams: new URLSearchParams('ids=SVT1') } });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toBe('CSO data temporarily unavailable');
    getPublicCsoDetailsByIds.mockRejectedValueOnce(new HttpError(400, 'At most 20 ids are supported'));
    res = await getBulkCso({ nextUrl: { searchParams: new URLSearchParams('ids=A,B') } });
    expect(res.status).toBe(400);
  });
});
