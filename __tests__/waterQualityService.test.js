jest.mock('../libs/database');

const { connectToDatabase } = require('../libs/database');
const { getLatestWaterQualitySnapshot, getWaterQualityDensitySeries, getCsoDetailsByIds, getCsoDetailsById } = require('../libs/services/waterQualityService');

function latestCollection(document) {
  return { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ next: jest.fn().mockResolvedValue(document) }) }) }) };
}

function aggregateCollection(rows) {
  return { aggregate: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(rows) }) };
}

const summaryDocument = {
  id: 'wq-1', scrape_timestamp: '2026-08-31T11:50:00Z',
  water_quality: { number_upstream_CSOs: '4', number_CSOs_per_km2: '0.04', CSO_IDs: ['ACTIVE', 'RECENT', 'OFFLINE', 'MISSING', 'ACTIVE'] },
};

describe('waterQualityService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('classifies fresh records and keeps post-summary worker data', async () => {
    const csoData = aggregateCollection([
      { _id: 'ACTIVE', doc: { DateScraped: '2026-08-31T11:55:00Z', attributes: { Id: 'ACTIVE', Status: 1, LatestEventStart: '2026-08-29T00:00:00Z', LastUpdated: '2026-08-31T11:54:00Z', ReceivingWaterCourse: 'River Trent' }, geometry: { x: -1.2, y: 52.9 } } },
      { _id: 'RECENT', doc: { DateScraped: '2026-08-31T11:55:00Z', attributes: { Id: 'RECENT', Status: 0, LatestEventStart: '2026-08-31T08:00:00Z', LatestEventEnd: '2026-08-31T09:00:00Z' }, geometry: { x: -1.3, y: 53 } } },
      { _id: 'OFFLINE', doc: { DateScraped: '2026-08-31T11:55:00Z', attributes: { Id: 'OFFLINE', Status: -1 } } },
    ]);
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => name === 'waterQuality' ? latestCollection(summaryDocument) : csoData) } });
    const result = await getLatestWaterQualitySnapshot(new Date('2026-08-31T12:00:00Z'));
    expect(result.ActiveCSOIds).toEqual(['ACTIVE']);
    expect(result.statusSummary).toEqual({ currentlySpilling: 1, recentlyStopped48h: 1, offline: 1, unknown: 1 });
    expect(result.locations.find((location) => location.id === 'ACTIVE')).toMatchObject({ status: 'active', receivingWaterCourse: 'River Trent' });
    expect(result.WaterQuality.CSOActiveTime).toBe(48);
    expect(result.WaterQuality.CSOIds).toEqual(['ACTIVE', 'RECENT', 'OFFLINE', 'MISSING']);
    expect(csoData.aggregate.mock.calls[0][0].some((stage) => stage.$sort)).toBe(false);
    expect(csoData.aggregate.mock.calls[0][0][1].$group.doc.$top).toBeDefined();
  });

  test('never labels stale summary or records as active', async () => {
    const csoData = aggregateCollection([{ _id: 'ACTIVE', doc: { DateScraped: '2026-08-31T11:00:00Z', attributes: { Id: 'ACTIVE', Status: 1, LatestEventStart: '2026-08-31T10:00:00Z' } } }]);
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn((name) => name === 'waterQuality' ? latestCollection({ ...summaryDocument, scrape_timestamp: '2026-08-31T10:00:00Z' }) : csoData) } });
    const result = await getLatestWaterQualitySnapshot(new Date('2026-08-31T12:00:00Z'));
    expect(result.ActiveCSOCount).toBe(0);
    expect(result.statusSummary.unknown).toBe(4);
    expect(result.health.state).toBe('stale');
  });

  test('returns null when no summary exists', async () => {
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => latestCollection(null)) } });
    await expect(getLatestWaterQualitySnapshot()).resolves.toBeNull();
  });

  test('filters invalid density rows and creates hourly averages', async () => {
    const collection = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([
      { scrape_timestamp: '2026-08-31T10:05:00Z', water_quality: { number_CSOs_per_km2: '0.01' } },
      { scrape_timestamp: '2026-08-31T10:20:00Z', water_quality: { number_CSOs_per_km2: '0.03' } },
      { scrape_timestamp: '2026-08-31T11:00:00Z', water_quality: { number_CSOs_per_km2: 'bad' } },
    ]) }) }) };
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => collection) } });
    const result = await getWaterQualityDensitySeries(24, new Date('2026-08-31T12:00:00Z'), 60);
    expect(result).toEqual([{ timestamp: '2026-08-31T10:00:00.000Z', numberCSOsPerKm2: 0.02 }]);
  });

  test('maps bulk details and throws for missing single CSO', async () => {
    const csoData = aggregateCollection([{ _id: 'CSO1', doc: { DateScraped: '2026-08-31T11:00:00Z', attributes: { Id: 'CSO1', Status: 1 }, geometry: { x: 1.2, y: 3.4 } } }]);
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => csoData) } });
    await expect(getCsoDetailsByIds(['CSO1'])).resolves.toMatchObject({ CSO1: { Id: 'CSO1', Status: 1, Coordinates: { x: 1.2, y: 3.4 } } });
    csoData.aggregate.mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue([]) });
    await expect(getCsoDetailsById('missing')).rejects.toMatchObject({ statusCode: 404, message: 'CSO data not found' });
  });
});
