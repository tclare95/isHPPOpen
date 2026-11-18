jest.mock('../../libs/services/waterQualityService');

const { getPublicCsoOutfallDetail } = require('../../libs/services/waterQualityService');
const { HttpError } = require('../../libs/api/http');
const { GET } = require('../../app/api/waterquality/cso/outfalls/[id]/route');

const ASSET = 'severn-trent:storm-overflow-activity:SVT01157';
const request = (query = '') => ({ nextUrl: { searchParams: new URLSearchParams(query) } });
const context = (id) => ({ params: Promise.resolve({ id }) });
const detail = (overrides = {}) => ({
  id: ASSET, identity: { state: 'resolved' }, status: { enabled: true, state: 'available' }, history: { enabled: true, state: 'available' }, ...overrides,
});

describe('CSO outfall detail route (Wave C / C4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reads one outfall by its canonical id and shares a complete answer through the CDN', async () => {
    getPublicCsoOutfallDetail.mockResolvedValue(detail());
    const res = await GET(request(), context(ASSET));
    expect(getPublicCsoOutfallDetail).toHaveBeenCalledWith(ASSET, { windowKey: undefined });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(ASSET);
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=120, stale-while-revalidate=180');
  });

  test('decodes an encoded id and passes the window through', async () => {
    getPublicCsoOutfallDetail.mockResolvedValue(detail());
    await GET(request('window=30d'), context(encodeURIComponent(ASSET)));
    expect(getPublicCsoOutfallDetail).toHaveBeenCalledWith(ASSET, { windowKey: '30d' });
  });

  test.each([
    ['identity unavailable', { identity: { state: 'unavailable' } }],
    ['status unavailable', { status: { enabled: true, state: 'unavailable' } }],
    ['history unavailable', { history: { enabled: true, state: 'unavailable' } }],
  ])('a degraded answer (%s) is cached briefly', async (_name, overrides) => {
    getPublicCsoOutfallDetail.mockResolvedValue(detail(overrides));
    const res = await GET(request(), context(ASSET));
    expect(res.status).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
  });

  test('a disabled section is not a degradation', async () => {
    getPublicCsoOutfallDetail.mockResolvedValue(detail({ history: { enabled: false } }));
    const res = await GET(request(), context(ASSET));
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=120, stale-while-revalidate=180');
  });

  test('an unknown or invalid outfall is a briefly cached 404', async () => {
    getPublicCsoOutfallDetail.mockRejectedValue(new HttpError(404, 'Outfall not found'));
    const res = await GET(request(), context('bad id!'));
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe('Outfall not found');
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=60');
  });

  test('an unavailable membership is a 503 that is never cached', async () => {
    getPublicCsoOutfallDetail.mockRejectedValue(new HttpError(503, 'Outfall details are temporarily unavailable'));
    const res = await GET(request(), context(ASSET));
    expect(res.status).toBe(503);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  test.each([['other=1'], ['window=7d&window=30d']])('refuses unsupported query %s', async (query) => {
    const res = await GET(request(query), context(ASSET));
    expect(res.status).toBe(400);
    expect(getPublicCsoOutfallDetail).not.toHaveBeenCalled();
  });
});
