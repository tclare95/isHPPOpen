jest.mock('../libs/database');

const { connectToDatabase } = require('../libs/database');
const { recordTrentLockSubmission } = require('../libs/services/trentLockService');

describe('trentLockService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('recordTrentLockSubmission saves fetched levels when all station calls succeed', async () => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'trent-1' });
    const httpClient = {
      get: jest.fn().mockResolvedValue({
        data: {
          items: [{ dateTime: '2026-03-08T09:00:00Z', value: 1.23 }],
        },
      }),
    };
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({ insertOne }),
      },
    });

    const result = await recordTrentLockSubmission(
      {
        dateTime: '2026-03-08T10:00:00Z',
        range: 'Medium',
        comments: 'Modern comment field',
        boatType: 'K1',
      },
      { httpClient, sleepFn }
    );

    expect(result).toEqual({ message: 'Update successful', id: 'trent-1' });
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-03-08T10:00:00Z',
        userRange: 'Medium',
        userComment: 'Modern comment field',
        userBoat: 'K1',
        recordedLevels: {
          colwick: [{ date: '2026-03-08T09:00:00Z', level: 1.23 }],
          clifton: [{ date: '2026-03-08T09:00:00Z', level: 1.23 }],
          shardlow: [{ date: '2026-03-08T09:00:00Z', level: 1.23 }],
          churchWilne: [{ date: '2026-03-08T09:00:00Z', level: 1.23 }],
          kegworth: [{ date: '2026-03-08T09:00:00Z', level: 1.23 }],
        },
      })
    );
    expect(httpClient.get).toHaveBeenCalledTimes(5);
    expect(sleepFn).toHaveBeenCalledTimes(5);
  });

  test('recordTrentLockSubmission falls back to legacy fields when level fetch fails', async () => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'trent-2' });
    const httpClient = {
      get: jest.fn()
        .mockResolvedValueOnce({ data: { items: [{ dateTime: '2026-03-08T09:00:00Z', value: 1.23 }] } })
        .mockRejectedValueOnce(new Error('downstream unavailable'))
        .mockResolvedValue({ data: { items: [{ dateTime: '2026-03-08T09:00:00Z', value: 1.23 }] } }),
    };

    connectToDatabase.mockResolvedValue({
      db: {
        collection: jest.fn().mockReturnValue({ insertOne }),
      },
    });

    await recordTrentLockSubmission(
      {
        dateTime: '2026-03-08T10:00:00Z',
        range: 'Low',
        comment: 'Legacy comment field',
        boat: 'C1',
        comments: 'Modern comment field',
        boatType: 'K1',
      },
      { httpClient, sleepFn: jest.fn().mockResolvedValue(undefined) }
    );

    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        userComment: 'Legacy comment field',
        userBoat: 'C1',
        recordedLevels: null,
      })
    );
  });
});