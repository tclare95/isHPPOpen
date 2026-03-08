jest.mock('../../libs/services/waterQualityService');

const {
  getLatestWaterQualitySnapshot,
  getWaterQualityDensitySeries,
  getCsoDetailsByIds,
  getCsoDetailsById,
} = require('../../libs/services/waterQualityService');
const { HttpError } = require('../../libs/api/http');
const { GET: getWaterQuality } = require('../../app/api/waterquality/route');
const { GET: getCsoDensity } = require('../../app/api/waterquality/csodensity/route');
const { GET: getBulkCso } = require('../../app/api/waterquality/cso/route');
const { GET: getSingleCso } = require('../../app/api/waterquality/cso/[id]/route');

describe('Water quality API route handlers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('water quality GET returns latest snapshot', async () => {
    getLatestWaterQualitySnapshot.mockResolvedValue({
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
    expect(getWaterQualityDensitySeries).toHaveBeenCalledWith(24, expect.any(Date));
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
    expect(getCsoDetailsByIds).not.toHaveBeenCalled();
  });

  test('bulk cso GET returns service data', async () => {
    getCsoDetailsByIds.mockResolvedValue({
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
    expect(getCsoDetailsByIds).toHaveBeenCalledWith(['CSO1', 'CSO2']);
  });

  test('single cso GET returns service data', async () => {
    getCsoDetailsById.mockResolvedValue({ Id: 'CSO1', Status: 1 });

    const res = await getSingleCso(
      {},
      {
        params: Promise.resolve({ id: 'CSO1' }),
      }
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data).toEqual({ Id: 'CSO1', Status: 1 });
    expect(getCsoDetailsById).toHaveBeenCalledWith('CSO1');
  });

  test('single cso GET maps service errors', async () => {
    getCsoDetailsById.mockRejectedValue(new HttpError(404, 'CSO data not found'));

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
});