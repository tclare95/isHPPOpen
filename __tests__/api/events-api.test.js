// Mock all necessary dependencies before imports
jest.mock('../../libs/services/eventsService');
jest.mock('next-auth/next');

// Mock the [...nextauth] import
jest.mock('../../pages/api/auth/[...nextauth]', () => ({
  authOptions: {
    providers: [],
    secret: 'test-secret'
  }
}));

require('dotenv').config({ path: '.env.test' });

const eventsService = require('../../libs/services/eventsService');
const { getServerSession } = require('next-auth/next');
const { createMocks } = require('node-mocks-http');
const eventsHandler = require('../../pages/api/events').default;

describe('Events API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns upcoming events', async () => {
    const now = new Date();
    now.setDate(now.getDate() - 1);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const mockEvents = [
      {
        _id: '603388a6dabef6c8fb6f3986',
        event_name: 'Test Event 1',
        event_details: 'This is a test event',
        event_start_date: tomorrow,
        event_end_date: nextWeek
      },
      {
        _id: '603388a6dabef6c8fb6f3987',
        event_name: 'Test Event 2',
        event_details: 'This is another test event',
        event_start_date: tomorrow,
        event_end_date: nextWeek
      }
    ];

    eventsService.fetchUpcomingEvents.mockResolvedValue({ count: 2, eventsArray: mockEvents });

    const originalConsoleLog = console.log;
    console.log = jest.fn();

    const { req, res } = createMocks({
      method: 'GET',
      query: { limit: '10' }
    });

    await eventsHandler(req, res);

    console.log = originalConsoleLog;

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('count', 2);
    expect(Array.isArray(data.eventsArray)).toBe(true);
    expect(data.eventsArray.length).toBe(2);
  });

  test('POST returns 403 when user is unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: JSON.stringify({ new_event_id: 'abc123' })
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(eventsService.upsertEvent).not.toHaveBeenCalled();
  });

  test('POST accepts JSON-string body and upserts event when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });
    eventsService.upsertEvent.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });

    const { req, res } = createMocks({
      method: 'POST',
      body: JSON.stringify({ new_event_id: 'evt-1' })
    });

    await eventsHandler(req, res);

    expect(eventsService.upsertEvent).toHaveBeenCalledWith({ new_event_id: 'evt-1' });
    expect(res._getStatusCode()).toBe(200);
  });

  test('DELETE returns 400 when id is missing', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'test@example.com' } });

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {}
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(eventsService.deleteEventById).not.toHaveBeenCalled();
  });
});
