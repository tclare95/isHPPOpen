jest.mock('../../libs/services/levelsService', () => ({
  getLatestLevelsSnapshot: jest.fn(),
  buildGovernmentForecastHealth: jest.fn(() => ({ source: 'government-forecast', state: 'unavailable', reason: 'retired' })),
}));

const { getLatestLevelsSnapshot } = require('../../libs/services/levelsService');
const { GET } = require('../../app/api/levels/route');

describe('Levels API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET returns the levels envelope unchanged', async () => {
    getLatestLevelsSnapshot.mockResolvedValue({
      level_data: [{ reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 }],
      forecast_data: [],
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.level_data).toEqual([{ reading_date: '2025-12-06T10:00:00Z', reading_level: 1.45 }]);
    expect(payload.data.forecast_data).toEqual([]);
    expect(getLatestLevelsSnapshot).toHaveBeenCalledTimes(1);
  });

  test('GET returns empty arrays when the levels service fails', async () => {
    getLatestLevelsSnapshot.mockRejectedValue(new Error('EA unavailable'));

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({ level_data: [], forecast_data: [] });
    expect(payload.data.health).toMatchObject({ state: 'unavailable', forecast: { source: 'government-forecast', state: 'unavailable' } });
  });
});
