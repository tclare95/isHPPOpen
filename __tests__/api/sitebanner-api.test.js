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
    getBanners.mockResolvedValue([{ banner_title: 'Important', banner_message: 'Test banner message', banner_enabled: true }]);
    const res = await GET();
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data[0].banner_message).toBe('Test banner message');
  });

  test('POST returns 401 when not authenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest({
      banner_title: 'Update',
      banner_message: 'New message',
      banner_enabled: true,
      banner_start_date: '2026-03-08T10:00:00.000Z',
      banner_end_date: '2026-03-09T10:00:00.000Z',
    }));
    expect(res.status).toBe(401);
  });

  test('POST updates banner when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    upsertBanner.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
    const res = await POST(makeRequest({
      banner_title: 'Update',
      banner_message: 'Updated message',
      banner_enabled: true,
      banner_start_date: '2026-03-08T10:00:00.000Z',
      banner_end_date: '2026-03-09T10:00:00.000Z',
    }));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.message).toBe('Banner updated');
  });

  test('POST supports an open-ended banner when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    upsertBanner.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
    const res = await POST(makeRequest({
      banner_title: 'Update',
      banner_message: 'Updated message',
      banner_enabled: true,
      banner_start_date: '2026-03-08T10:00:00.000Z',
      banner_end_date: null,
    }));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.message).toBe('Banner updated');
  });

  test('POST supports a banner that starts immediately when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    upsertBanner.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });
    const res = await POST(makeRequest({
      banner_title: 'Update',
      banner_message: 'Updated message',
      banner_enabled: true,
      banner_start_date: null,
      banner_end_date: null,
    }));
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
