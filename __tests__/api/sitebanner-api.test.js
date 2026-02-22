jest.mock('../../libs/services/siteBannerService');
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

const { getBanners, upsertBanner } = require('../../libs/services/siteBannerService');
const { getServerSession } = require('next-auth');
const { ValidationError } = require('yup');
const { GET, POST } = require('../../app/api/sitebanner/route');

const makeRequest = (body) => ({
  nextUrl: new URL('http://localhost/api/sitebanner'),
  async json() {
    return body;
  },
});

describe('Site Banner API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET returns banner data', async () => {
    getBanners.mockResolvedValue([{ banner_message: 'Test banner message' }]);
    const res = await GET();
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data[0].banner_message).toBe('Test banner message');
  });

  test('POST returns 401 when not authenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ banner_message: 'New message' }));
    expect(res.status).toBe(401);
  });

  test('POST updates banner when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    upsertBanner.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
    const res = await POST(makeRequest({ banner_message: 'Updated message' }));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.message).toBe('Banner updated');
  });

  test('POST returns 400 on validation error', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    upsertBanner.mockRejectedValue(new ValidationError('Validation failed'));
    const res = await POST(makeRequest({ invalid: 'data' }));
    const payload = await res.json();
    expect(res.status).toBe(400);
    expect(payload.error.message).toBe('Validation failed');
  });
});
