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
const { getServerSession } = require('next-auth/next');
const { ValidationError } = require('yup');

describe('Events API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns upcoming events using success envelope', async () => {
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
        event_end_date: nextWeek,
      },
    ];

    eventsService.fetchUpcomingEvents.mockResolvedValue({ count: 1, eventsArray: mockEvents });

    const { req, res } = createMocks({ method: 'GET', query: { limit: '10' } });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(true);
    expect(payload.data.count).toBe(1);
    expect(payload.data.eventsArray).toHaveLength(1);
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledWith(10);
  });

  test('POST returns 401 envelope when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        new_event_name: 'Race',
        new_event_start_date: '2026-02-20',
        new_event_end_date: '2026-02-21',
        new_event_details: 'Details',
      },
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Unauthorized');
  });

  test('POST supports legacy single-key encoded body parsing', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.upsertEvent.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });

    const legacyPayload = JSON.stringify({
      new_event_id: 'evt-1',
      new_event_name: 'Race',
      new_event_start_date: '2026-02-20',
      new_event_end_date: '2026-02-21',
      new_event_details: 'Details',
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: { [legacyPayload]: '' },
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(true);
    expect(payload.data.message).toBe('Update successful');
    expect(payload.data.id).toBe('evt-1');
    expect(eventsService.upsertEvent).toHaveBeenCalledWith({
      new_event_id: 'evt-1',
      new_event_name: 'Race',
      new_event_start_date: '2026-02-20',
      new_event_end_date: '2026-02-21',
      new_event_details: 'Details',
    });
  });

  test('POST returns 400 envelope on validation error', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.upsertEvent.mockRejectedValue(new ValidationError('Validation failed'));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        new_event_name: 'Race',
      },
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Validation failed');
  });

  test('DELETE returns 200 envelope when deleted', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.deleteEventById.mockResolvedValue({ deletedCount: 1 });

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: '603388a6dabef6c8fb6f3986' },
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(true);
    expect(payload.data.deleted).toBe(true);
    expect(payload.data.id).toBe('603388a6dabef6c8fb6f3986');
  });

  test('DELETE returns 400 envelope when id is missing', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });

    const { req, res } = createMocks({
      method: 'DELETE',
      query: {},
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Missing id parameter');
  });

  test('returns JSON 405 envelope for unsupported methods', async () => {
    const { req, res } = createMocks({ method: 'PATCH' });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getHeaders().allow).toEqual(['GET', 'POST', 'DELETE']);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toContain('Method PATCH Not Allowed');
  });
});