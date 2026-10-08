jest.mock('../../libs/services/levelsService', () => ({ getLatestLevelsSnapshot: jest.fn() }));
jest.mock('../../libs/services/forecastService', () => ({ getLatestForecastSnapshot: jest.fn() }));
jest.mock('../../libs/services/hppStatusService', () => ({ getHppStatusSnapshot: jest.fn() }));
jest.mock('../../libs/services/waterQualityService', () => ({ getLatestWaterQualitySnapshot: jest.fn() }));
jest.mock('../../libs/services/trentWeirsService', () => ({ getTrentWeirsSnapshot: jest.fn() }));

const { getServerSession } = require('next-auth');
const { getLatestLevelsSnapshot } = require('../../libs/services/levelsService');
const { getLatestForecastSnapshot } = require('../../libs/services/forecastService');
const { getHppStatusSnapshot } = require('../../libs/services/hppStatusService');
const { getLatestWaterQualitySnapshot } = require('../../libs/services/waterQualityService');
const { getTrentWeirsSnapshot } = require('../../libs/services/trentWeirsService');
const { GET } = require('../../app/api/admin/operational-health/route');

const startedAt = new Date('2026-10-08T12:00:00Z');
const sources = [
  ['levels', getLatestLevelsSnapshot, 10],
  ['forecast', getLatestForecastSnapshot, 20],
  ['hppStatus', getHppStatusSnapshot, 30],
  ['waterQuality', getLatestWaterQualitySnapshot, 40],
  ['trentWeirs', getTrentWeirsSnapshot, 50],
];
const healthFor = (source) => ({ source, state: 'fresh', generatedAt: startedAt.toISOString(), fetchedAt: startedAt.toISOString(), ageSeconds: 0 });

describe('Operational health API route handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: startedAt });
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    for (const [name, check, delay] of sources) {
      check.mockImplementation(() => new Promise((resolve) => setTimeout(() => {
        const snapshot = { health: healthFor(name) };
        resolve(name === 'hppStatus' ? { data: snapshot } : snapshot);
      }, delay)));
    }
  });

  afterEach(() => jest.useRealTimers());

  test('awaits every successful source and preserves the response contract', async () => {
    const pending = GET();
    await jest.advanceTimersByTimeAsync(50);
    const response = await pending;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        checkedAt: new Date(startedAt.getTime() + 50).toISOString(),
        sources: sources.map(([name, , latencyMs]) => ({ name, latencyMs, health: healthFor(name) })),
      },
    });
    for (const [, check] of sources) expect(check).toHaveBeenCalledTimes(1);
  });

  test('times a failed source independently and hides provider exception details', async () => {
    getLatestForecastSnapshot.mockImplementation(() => new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('private provider credentials')), 65);
    }));
    const pending = GET();
    await jest.advanceTimersByTimeAsync(65);
    const response = await pending;
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        checkedAt: new Date(startedAt.getTime() + 65).toISOString(),
        sources: sources.map(([name, , latencyMs]) => name === 'forecast' ? {
          name,
          latencyMs: 65,
          health: { source: name, state: 'unavailable', generatedAt: null, fetchedAt: new Date(startedAt.getTime() + 65).toISOString(), ageSeconds: null },
        } : { name, latencyMs, health: healthFor(name) }),
      },
    });
    expect(JSON.stringify(payload)).not.toContain('private provider credentials');
  });

  test.each([-60000, 60000])('keeps durations accurate when the wall clock shifts by %i ms', async (shift) => {
    getLatestForecastSnapshot.mockImplementation(() => new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('provider unavailable')), 20);
    }));
    const pending = GET();
    await jest.advanceTimersByTimeAsync(5);
    jest.setSystemTime(startedAt.getTime() + 5 + shift);
    await jest.advanceTimersByTimeAsync(45);
    const payload = await (await pending).json();

    expect(payload.data.sources.map(({ latencyMs }) => latencyMs)).toEqual([10, 20, 30, 40, 50]);
  });

  test('returns 401 without checking sources when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { message: 'Unauthorized' } });
    for (const [, check] of sources) expect(check).not.toHaveBeenCalled();
  });
});
