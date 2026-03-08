jest.mock('../libs/database');

const { connectToDatabase } = require('../libs/database');
const {
  getLatestWaterQualitySnapshot,
  getWaterQualityDensitySeries,
  getCsoDetailsByIds,
  getCsoDetailsById,
} = require('../libs/services/waterQualityService');

describe('waterQualityService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getLatestWaterQualitySnapshot returns transformed latest record', async () => {
    const waterQualityCollection = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            next: jest.fn().mockResolvedValue({
              id: 'wq-1',
              scrape_timestamp: '2026-03-08T10:00:00Z',
              water_quality: {
                number_upstream_CSOs: '3',
                number_CSOs_per_km2: '1.25',
                CSO_IDs: ['A', 'B'],
              },
            }),
          }),
        }),
      }),
    };
    const csoDataCollection = {
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            _id: 'A',
            mostRecent: {
              attributes: {
                LatestEventStart: '2026-03-08T08:00:00Z',
              },
            },
          },
        ]),
      }),
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn((name) => {
          if (name === 'waterQuality') {
            return waterQualityCollection;
          }

          if (name === 'csoData') {
            return csoDataCollection;
          }

          return null;
        }),
      },
    });

    const result = await getLatestWaterQualitySnapshot(new Date('2026-03-08T12:00:00Z'));

    expect(result).toEqual({
      Id: 'wq-1',
      ScrapeTimestamp: '2026-03-08T10:00:00Z',
      WaterQuality: {
        NumberUpstreamCSOs: 3,
        NumberCSOsPerKm2: 1.25,
        CSOIds: ['A', 'B'],
        CSOActiveTime: 4,
      },
      ActiveCSOCount: 1,
      ActiveCSOIds: ['A'],
    });
  });

  test('getWaterQualityDensitySeries filters invalid rows', async () => {
    const waterQualityCollection = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([
            { scrape_timestamp: '2026-03-08T09:00:00Z', water_quality: { number_CSOs_per_km2: '1.5' } },
            { scrape_timestamp: '2026-03-08T10:00:00Z', water_quality: { number_CSOs_per_km2: 'NaN' } },
          ]),
        }),
      }),
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue(waterQualityCollection),
      },
    });

    const result = await getWaterQualityDensitySeries(24, new Date('2026-03-08T12:00:00Z'));

    expect(result).toEqual([{ timestamp: '2026-03-08T09:00:00Z', numberCSOsPerKm2: 1.5 }]);
  });

  test('getCsoDetailsByIds maps aggregate results', async () => {
    const csoDataCollection = {
      aggregate: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([
          {
            doc: {
              DateScraped: '2026-03-08T10:00:00Z',
              attributes: {
                Id: 'CSO1',
                Status: 1,
                LatestEventStart: '2026-03-08T08:00:00Z',
                LatestEventEnd: '2026-03-08T09:00:00Z',
              },
              geometry: { x: 1.2, y: 3.4 },
            },
          },
        ]),
      }),
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue(csoDataCollection),
      },
    });

    const result = await getCsoDetailsByIds(['CSO1']);

    expect(result).toEqual({
      CSO1: {
        Id: 'CSO1',
        Status: 1,
        LatestEventStart: '2026-03-08T08:00:00Z',
        LatestEventEnd: '2026-03-08T09:00:00Z',
        DateScraped: '2026-03-08T10:00:00Z',
        Coordinates: { x: 1.2, y: 3.4 },
      },
    });
  });

  test('getCsoDetailsById throws when not found', async () => {
    const csoDataCollection = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            next: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue(csoDataCollection),
      },
    });

    await expect(getCsoDetailsById('missing')).rejects.toMatchObject({
      statusCode: 404,
      message: 'CSO data not found',
    });
  });
});