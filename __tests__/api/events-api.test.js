jest.mock('../../libs/services/eventsService');

const eventsService = require('../../libs/services/eventsService');
const { GET } = require('../../app/api/events/route');

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

  test('the public route is read-only; event writes live under /api/admin/events', () => {
    const route = require('../../app/api/events/route');
    expect(Object.keys(route).filter((key) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(key))).toEqual([]);
  });

  test('GET falls back to the default limit for a non-integer limit', async () => {
    eventsService.fetchUpcomingEvents.mockResolvedValue({ count: 0, eventsArray: [] });
    await GET(makeRequest('http://localhost/api/events?limit=abc'));
    expect(eventsService.fetchUpcomingEvents).toHaveBeenCalledWith(5);
  });
});
