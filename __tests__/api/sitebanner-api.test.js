// Mock all necessary dependencies before imports
jest.mock('../../libs/services/siteBannerService');
jest.mock('next-auth/next');

// Mock the [...nextauth] import
jest.mock('../../pages/api/auth/[...nextauth]', () => ({
  authOptions: {
    providers: [],
    secret: 'test-secret'
  }
}));

require('dotenv').config({ path: '.env.test' });

const { createMocks } = require('node-mocks-http');
const siteBannerHandler = require('../../pages/api/sitebanner').default;
const { getBanners, upsertBanner } = require('../../libs/services/siteBannerService');
const { getServerSession } = require('next-auth/next');

describe('Site Banner API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/sitebanner', () => {
    test('returns banner data', async () => {
      const mockBanners = [
        { _id: '1', banner_message: 'Test banner message', active: true },
      ];

      getBanners.mockResolvedValue(mockBanners);

      const { req, res } = createMocks({
        method: 'GET',
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseData = JSON.parse(res._getData());
      expect(responseData).toEqual(mockBanners);
      expect(getBanners).toHaveBeenCalled();
    });

    test('returns 500 on service error', async () => {
      getBanners.mockRejectedValue(new Error('Database error'));

      const { req, res } = createMocks({
        method: 'GET',
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseData = JSON.parse(res._getData());
      expect(responseData.message).toBe('Internal Server Error');
    });
  });

  describe('POST /api/sitebanner', () => {
    test('returns 403 when not authenticated', async () => {
      getServerSession.mockResolvedValue(null);

      const { req, res } = createMocks({
        method: 'POST',
        body: { banner_message: 'New message' },
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
      const responseData = JSON.parse(res._getData());
      expect(responseData.message).toBe('Unauthorized');
    });

    test('updates banner when authenticated', async () => {
      getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
      upsertBanner.mockResolvedValue({ modifiedCount: 1 });

      const { req, res } = createMocks({
        method: 'POST',
        body: { banner_message: 'Updated message' },
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(upsertBanner).toHaveBeenCalledWith({ banner_message: 'Updated message' });
    });

    test('returns 400 on validation error', async () => {
      getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
      upsertBanner.mockRejectedValue(new Error('Validation failed'));

      const { req, res } = createMocks({
        method: 'POST',
        body: { invalid: 'data' },
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseData = JSON.parse(res._getData());
      expect(responseData.message).toBe('Validation failed');
    });
  });

  describe('Method handling', () => {
    test('returns 405 for unsupported methods', async () => {
      const { req, res } = createMocks({
        method: 'DELETE',
      });

      await siteBannerHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getHeaders().allow).toEqual(['GET', 'POST']);
    });
  });
});
