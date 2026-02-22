jest.mock('../../libs/services/eventsService');
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

const eventsService = require('../../libs/services/eventsService');
const { getServerSession } = require('next-auth');
const { ValidationError } = require('yup');
const { GET, POST, DELETE } = require('../../app/api/events/route');

const makeRequest = (url, body) => ({
  nextUrl: new URL(url),
  async json() {
    return body;
  },
});

describe('Events API route handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET returns upcoming events', async () => {
    eventsService.fetchUpcomingEvents.mockResolvedValue({ count: 1, eventsArray: [{ event_name: 'Test' }] });
    const res = await GET(makeRequest('http://localhost/api/events?limit=10'));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.count).toBe(1);
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledWith(10);
  });

  test('POST returns 401 when unauthenticated', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest('http://localhost/api/events', { new_event_name: 'Race' }));
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Unauthorized');
  });

  test('POST updates event when authenticated', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.upsertEvent.mockResolvedValue({ modifiedCount: 1, upsertedCount: 0 });

    const res = await POST(makeRequest('http://localhost/api/events', {
      new_event_id: 'evt-1',
      new_event_name: 'Race',
      new_event_start_date: '2026-02-20',
      new_event_end_date: '2026-02-21',
      new_event_details: 'Details',
    }));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe('evt-1');
  });

  test('POST returns 400 on validation error', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.upsertEvent.mockRejectedValue(new ValidationError('Validation failed'));

    const res = await POST(makeRequest('http://localhost/api/events', { new_event_name: 'Race' }));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error.message).toBe('Validation failed');
  });

  test('DELETE returns 404 when event does not exist', async () => {
    getServerSession.mockResolvedValue({ user: { email: 'admin@test.com' } });
    eventsService.deleteEventById.mockResolvedValue({ deletedCount: 0 });

    const res = await DELETE(makeRequest('http://localhost/api/events?id=abc'));
    const payload = await res.json();

    expect(res.status).toBe(404);
    expect(payload.error.message).toBe('Event Not Found');
  });
});