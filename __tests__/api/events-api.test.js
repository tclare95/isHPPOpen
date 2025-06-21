// Mock all necessary dependencies before imports
jest.mock('../../libs/database');
jest.mock('next-auth/next');
jest.mock('mongodb');

// Mock the [...nextauth] import
jest.mock('../../pages/api/auth/[...nextauth]', () => ({
  authOptions: {
    providers: [],
    secret: 'test-secret'
  }
}));

require('dotenv').config({ path: '.env.test' });

const dbModule = require('../../libs/database');
const { createMocks } = require('node-mocks-http');
const eventsHandler = require('../../pages/api/events').default;

describe('Events API', () => {
  test('GET returns upcoming events', async () => {
    // Generate mock events data
    const now = new Date();
    now.setDate(now.getDate() - 1); // Matches the API's date adjustment
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const mockEvents = [
      {
        _id: "603388a6dabef6c8fb6f3986",
        event_name: "Test Event 1",
        event_details: "This is a test event",
        event_start_date: tomorrow,
        event_end_date: nextWeek
      },
      {
        _id: "603388a6dabef6c8fb6f3987",
        event_name: "Test Event 2",
        event_details: "This is another test event",
        event_start_date: tomorrow,
        event_end_date: nextWeek
      }
    ];
    
    // Setup the database mock to return our test events
    const toArrayMock = jest.fn().mockResolvedValue(mockEvents);
    const sortMock = jest.fn().mockReturnValue({ toArray: toArrayMock });
    const limitMock = jest.fn().mockReturnValue({ sort: sortMock });
    const findMock = jest.fn().mockReturnValue({ limit: limitMock });
    
    const mockCollection = jest.fn().mockReturnValue({ find: findMock });
    
    const mockDb = {
      collection: mockCollection
    };
    
    const mockClient = { close: jest.fn() };
    dbModule.connectToDatabase.mockResolvedValue({ db: mockDb, client: mockClient });

    // Mock console methods to prevent noise during tests
    const originalConsoleLog = console.log;
    console.log = jest.fn();
    
    // Create mock request with GET method
    const { req, res } = createMocks({
      method: 'GET',
      query: { limit: '10' }
    });

    // Call the API handler
    await eventsHandler(req, res);

    // Restore console
    console.log = originalConsoleLog;

    // Verify database was called correctly
    expect(mockCollection).toHaveBeenCalledWith('eventschemas');
    expect(findMock).toHaveBeenCalled();
    expect(limitMock).toHaveBeenCalledWith(10);
    expect(sortMock).toHaveBeenCalledWith({ event_start_date: 1 });
    
    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('count', 2);
    expect(data).toHaveProperty('eventsArray');
    expect(Array.isArray(data.eventsArray)).toBe(true);
    expect(data.eventsArray.length).toBe(2);
  });
});