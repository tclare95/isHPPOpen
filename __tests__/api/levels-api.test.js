jest.mock('../../libs/services/levelsService');

const { getLatestLevelsSnapshot } = require('../../libs/services/levelsService');
const { GET } = require('../../app/api/levels/route');

describe('Levels API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET returns level and forecast data', async () => {
    getLatestLevelsSnapshot.mockResolvedValue({
      level_data: [{ reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 }],
      forecast_data: [{ forecast_date: '2025-12-06T12:00:00Z', forecast_reading: 1.48 }],
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.level_data).toEqual([{ reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 }]);
    expect(payload.data.forecast_data).toEqual([{ forecast_date: '2025-12-06T12:00:00Z', forecast_reading: 1.48 }]);
    expect(getLatestLevelsSnapshot).toHaveBeenCalledTimes(1);
  });
});
