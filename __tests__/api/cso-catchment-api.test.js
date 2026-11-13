jest.mock('../../libs/services/waterQualityService');

const { getPublicCsoCatchmentMonitoring } = require('../../libs/services/waterQualityService');
const { HttpError } = require('../../libs/api/http');
const { GET, maxDuration } = require('../../app/api/waterquality/cso/catchment/route');

const request = (query = '') => ({ nextUrl: { searchParams: new URLSearchParams(query) } });

describe('CSO catchment monitoring route (#114)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('defaults to the reviewed set and is CDN-cacheable when complete', async () => {
    const available = { enabled: true, state: 'available', summary: {} };
    getPublicCsoCatchmentMonitoring.mockResolvedValue(available);
    const res = await GET(request());
    expect(getPublicCsoCatchmentMonitoring).toHaveBeenCalledWith(undefined);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(available);
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
    expect(maxDuration).toBe(60);
  });

  test('partial, unavailable and disabled answers are cached briefly', async () => {
    for (const value of [{ enabled: true, state: 'partial' }, { enabled: true, state: 'unavailable', reason: 'set_not_enabled' }, { enabled: false }]) {
      getPublicCsoCatchmentMonitoring.mockResolvedValueOnce(value);
      const res = await GET(request('set=hpp-catchment'));
      expect(res.status).toBe(200);
      expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
    }
    expect(getPublicCsoCatchmentMonitoring).toHaveBeenLastCalledWith('hpp-catchment');
  });

  test('rejects a set that is not reviewed without caching the error', async () => {
    getPublicCsoCatchmentMonitoring.mockRejectedValue(new HttpError(400, 'set must be one of hpp-catchment'));
    const res = await GET(request('set=anything'));
    expect(res.status).toBe(400);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
