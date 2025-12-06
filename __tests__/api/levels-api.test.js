// Mock all necessary dependencies before imports
jest.mock('../../libs/database');

require('dotenv').config({ path: '.env.test' });

const { createMocks } = require('node-mocks-http');
const levelsHandler = require('../../pages/api/levels').default;
const { connectToDatabase } = require('../../libs/database');

describe('Levels API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns level and forecast data', async () => {
    const mockData = {
      level_readings: [
        { reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 },
        { reading_date: '2025-12-06T09:00:00Z', reading_level: 1.42 },
      ],
      forecast_readings: [
        { forecast_date: '2025-12-06T12:00:00Z', forecast_reading: 1.48 },
      ],
    };

    const mockCursor = {
      next: jest.fn().mockResolvedValue(mockData),
    };

    const mockCollection = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(mockCursor),
        }),
      }),
    };

    const mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    };

    connectToDatabase.mockResolvedValue({ db: mockDb });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await levelsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.level_data).toEqual(mockData.level_readings);
    expect(responseData.forecast_data).toEqual(mockData.forecast_readings);
    expect(mockDb.collection).toHaveBeenCalledWith('riverschemas');
  });

  test('returns 405 for non-GET methods', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await levelsHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getHeaders().allow).toEqual(['GET']);
  });

  test('returns 500 on database error', async () => {
    connectToDatabase.mockRejectedValue(new Error('Database connection failed'));

    const { req, res } = createMocks({
      method: 'GET',
    });

    await levelsHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = JSON.parse(res._getData());
    expect(responseData.message).toBe('Internal Server Error');
  });
});
