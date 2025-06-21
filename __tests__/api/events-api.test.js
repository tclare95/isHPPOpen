// Mock all necessary dependencies before imports
jest.mock('../../libs/services/eventsService');
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

const eventsService = require('../../libs/services/eventsService');
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
    
    // Mock service layer to return our test events
    eventsService.fetchUpcomingEvents.mockResolvedValue({ count: 2, eventsArray: mockEvents });

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
    
    // Verify response
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('count', 2);
    expect(data).toHaveProperty('eventsArray');
    expect(Array.isArray(data.eventsArray)).toBe(true);
    expect(data.eventsArray.length).toBe(2);
  });
});