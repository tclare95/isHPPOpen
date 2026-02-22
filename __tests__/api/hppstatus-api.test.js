require('dotenv').config({ path: '.env.test' });

// Mock the database module
jest.mock('../../libs/database');

const dbModule = require('../../libs/database');
const { createMocks } = require('node-mocks-http');
const hppStatusHandler = require('../../pages/api/hppstatus').default;

describe('HPP Status API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 405 for non-GET methods', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await hppStatusHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getHeaders().allow).toEqual(['GET']);
    const responseData = JSON.parse(res._getData());
    expect(responseData.ok).toBe(false);
    expect(responseData.error.message).toContain('Method POST Not Allowed');
  });

  test('returns HPP status data', async () => {
    // Generate test data in the correct format
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    
    // Create mock records that the API expects
    const mockRecords = [
      {
        // Most recent record: open status
        _id: "record-1",
        timestamp: now.toISOString(),
        value: true, // HPP is open
      },
      {
        // Closed status from a month ago
        _id: "record-2",
        timestamp: oneMonthAgo.toISOString(),
        value: false, // HPP was closed
      },
      {
        // Open status from two months ago
        _id: "record-3",
        timestamp: twoMonthsAgo.toISOString(),
        value: true, // HPP was open
      }
    ];
    
    // Mock the database collections
    const mockDb = {
      collection: jest.fn().mockImplementation((collectionName) => {
        if (collectionName === 'openIndicator') {
          return {
            find: jest.fn().mockReturnValue({
              toArray: jest.fn().mockResolvedValue(mockRecords)
            })
          };
        }
        
        return {
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([])
          })
        };
      })
    };
    
    const mockClient = { close: jest.fn() };
    dbModule.connectToDatabase.mockResolvedValue({ db: mockDb, client: mockClient });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await hppStatusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.ok).toBe(true);
    expect(responseData.data).toHaveProperty('currentStatus');
    expect(responseData.data).toHaveProperty('lastChangedDate');
    expect(responseData.data).toHaveProperty('closuresInLast7Days');
    expect(responseData.data).toHaveProperty('closuresInLast28Days');
    expect(responseData.data).toHaveProperty('closuresInLast182Days');
    expect(responseData.data).toHaveProperty('closuresInLast365Days');
  });

  test('returns 200 empty state when there are no records', async () => {
    const mockDb = {
      collection: jest.fn().mockReturnValue({
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    dbModule.connectToDatabase.mockResolvedValue({ db: mockDb, client: { close: jest.fn() } });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await hppStatusHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData());
    expect(responseData.ok).toBe(true);
    expect(responseData.data.isEmpty).toBe(true);
    expect(responseData.data.currentStatus).toBeNull();
    expect(responseData.data.closuresInLast7Days).toBe(0);
  });
});