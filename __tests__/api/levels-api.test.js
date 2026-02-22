jest.mock('../../libs/database');

const { connectToDatabase } = require('../../libs/database');
const { GET } = require('../../app/api/levels/route');

describe('Levels API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET returns level and forecast data', async () => {
    const mockData = {
      level_readings: [{ reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 }],
      forecast_readings: [{ forecast_date: '2025-12-06T12:00:00Z', forecast_reading: 1.48 }],
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(mockData) }),
            }),
          }),
        }),
      },
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.level_data).toEqual(mockData.level_readings);
    expect(payload.data.forecast_data).toEqual(mockData.forecast_readings);
  });
});
