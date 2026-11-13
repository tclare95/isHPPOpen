/** @jest-environment node */
jest.mock('server-only', () => ({}));

const { buildGovernmentForecastHealth, readEaColwickLevels } = require('../libs/services/levelsService');

const EA_URL = 'https://environment.data.gov.uk/flood-monitoring/id/stations/4009/readings?_sorted&_limit=672&parameter=level';
const MEASURE = 'http://environment.data.gov.uk/flood-monitoring/id/measures/4009-level-stage-i-15_min-mASD';

describe('levelsService', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('the government forecast is reported as retired and unavailable, never as an ML forecast', () => {
    expect(buildGovernmentForecastHealth(new Date('2026-11-13T10:00:00Z'))).toEqual({
      source: 'government-forecast', state: 'unavailable', reason: 'retired',
      generatedAt: null, fetchedAt: '2026-11-13T10:00:00.000Z', ageSeconds: null,
    });
  });

  test('readEaColwickLevels reads only the Colwick level measure and returns newest-first readings', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ items: [
        { dateTime: '2026-11-13T10:00:00Z', value: 1.21, measure: MEASURE },
        { dateTime: '2026-11-13T09:45:00Z', value: '1.2', measure: MEASURE },
      ] }),
    });

    await expect(readEaColwickLevels()).resolves.toEqual({ readings: [
      { dateTime: '2026-11-13T10:00:00Z', value: 1.21 },
      { dateTime: '2026-11-13T09:45:00Z', value: 1.2 },
    ] });
    expect(global.fetch).toHaveBeenCalledWith(EA_URL, expect.objectContaining({ next: expect.objectContaining({ revalidate: 900 }) }));
  });

  test('readEaColwickLevels never rejects', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    await expect(readEaColwickLevels()).resolves.toEqual({ error: 'EA_UNAVAILABLE' });

    global.fetch.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ items: [] }) });
    await expect(readEaColwickLevels()).resolves.toEqual({ error: 'EA_INVALID_SERIES' });
  });
});
