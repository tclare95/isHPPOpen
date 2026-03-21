const { getLatestLevelsSnapshot } = require('../libs/services/levelsService');

describe('levelsService', () => {
  const originalS3LevelsUrl = process.env.S3_LEVELS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_LEVELS_URL = 'https://example.com/levels/latest.json';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.S3_LEVELS_URL = originalS3LevelsUrl;
  });

  test('getLatestLevelsSnapshot returns latest level and forecast arrays', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        level_readings: [{ reading_level: 1.1 }],
        forecast_readings: [{ forecast_reading: 1.2 }],
      }),
    });

    const result = await getLatestLevelsSnapshot();

    expect(result).toEqual({
      level_data: [{ reading_level: 1.1 }],
      forecast_data: [{ forecast_reading: 1.2 }],
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/levels/latest.json',
      expect.objectContaining({
        next: expect.objectContaining({ revalidate: 900 }),
      }),
    );
  });

  test('getLatestLevelsSnapshot normalizes missing arrays', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        level_readings: null,
      }),
    });

    const result = await getLatestLevelsSnapshot();

    expect(result).toEqual({
      level_data: [],
      forecast_data: [],
    });
  });

  test('getLatestLevelsSnapshot throws when S3_LEVELS_URL is missing', async () => {
    delete process.env.S3_LEVELS_URL;

    await expect(getLatestLevelsSnapshot()).rejects.toThrow('Levels URL not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('getLatestLevelsSnapshot throws when fetch fails', async () => {
    global.fetch.mockResolvedValue({ ok: false });

    await expect(getLatestLevelsSnapshot()).rejects.toThrow('Failed to fetch levels data');
  });
});