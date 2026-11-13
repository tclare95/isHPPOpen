jest.mock('../../libs/services/waterQualityService');

const { getPublicCsoEventHistory, getPublicCsoEventDetail } = require('../../libs/services/waterQualityService');
const { HttpError } = require('../../libs/api/http');
const { GET: getHistory } = require('../../app/api/waterquality/cso/events/route');
const { GET: getDetail } = require('../../app/api/waterquality/cso/events/[eventId]/route');

const request = (query = '') => ({ nextUrl: { searchParams: new URLSearchParams(query) } });
const available = { enabled: true, state: 'available', events: [], evidence: { outfalls: { failed: 0 } } };

describe('CSO event history routes (#121)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('defaults to 24 hours and is CDN-cacheable when complete', async () => {
    getPublicCsoEventHistory.mockResolvedValue(available);
    const res = await getHistory(request());
    expect(getPublicCsoEventHistory).toHaveBeenCalledWith('24h', { outfall: undefined });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(available);
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
  });

  test('degraded, unavailable or disabled histories are cached briefly', async () => {
    for (const value of [{ ...available, evidence: { outfalls: { failed: 1 } } }, { ...available, state: 'unavailable' }, { enabled: false }]) {
      getPublicCsoEventHistory.mockResolvedValueOnce(value);
      const res = await getHistory(request('window=7d'));
      expect(res.status).toBe(200);
      expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
    }
    expect(getPublicCsoEventHistory).toHaveBeenLastCalledWith('7d', { outfall: undefined });
  });

  test('passes one outfall through for a server-side filter (#114)', async () => {
    getPublicCsoEventHistory.mockResolvedValue(available);
    await getHistory(request('window=7d&outfall=SVT01294'));
    expect(getPublicCsoEventHistory).toHaveBeenCalledWith('7d', { outfall: 'SVT01294' });
  });

  test('rejects an unsupported window', async () => {
    getPublicCsoEventHistory.mockRejectedValue(new HttpError(400, 'window must be one of 24h, 7d, 30d'));
    const res = await getHistory(request('window=1y'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/window must be one of/);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  test('event detail passes the id through and maps errors', async () => {
    getPublicCsoEventDetail.mockResolvedValueOnce({ event: { eventId: 'cse_x' } });
    let res = await getDetail({}, { params: Promise.resolve({ eventId: 'cse_x' }) });
    expect(res.status).toBe(200);
    expect(getPublicCsoEventDetail).toHaveBeenCalledWith('cse_x');
    getPublicCsoEventDetail.mockRejectedValueOnce(new HttpError(404, 'Event not found'));
    res = await getDetail({}, { params: Promise.resolve({ eventId: 'cse_y' }) });
    expect(res.status).toBe(404);
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
    getPublicCsoEventDetail.mockRejectedValueOnce(new HttpError(503, 'Event history temporarily unavailable'));
    res = await getDetail({}, { params: Promise.resolve({ eventId: 'cse_z' }) });
    expect(res.status).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });
});
