jest.mock('../libs/database');

const { connectToDatabase } = require('../libs/database');
const { getLatestLevelsSnapshot } = require('../libs/services/levelsService');

describe('levelsService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getLatestLevelsSnapshot returns latest level and forecast arrays', async () => {
    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                next: jest.fn().mockResolvedValue({
                  level_readings: [{ reading_level: 1.1 }],
                  forecast_readings: [{ forecast_reading: 1.2 }],
                }),
              }),
            }),
          }),
        }),
      },
    });

    const result = await getLatestLevelsSnapshot();

    expect(result).toEqual({
      level_data: [{ reading_level: 1.1 }],
      forecast_data: [{ forecast_reading: 1.2 }],
    });
  });
});