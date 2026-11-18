/** @jest-environment node */
// Admin event routes over the real service and an in-memory collection: identity, validation and cache refresh.
jest.mock('mongodb', () => jest.requireActual('mongodb'));
jest.mock('../../libs/database', () => ({ connectToDatabase: jest.fn() }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

const { ObjectId } = require('mongodb');
const { getServerSession } = require('next-auth');
const { revalidateTag } = require('next/cache');
const { connectToDatabase } = require('../../libs/database');
const { createEventsCollection } = require('../../testUtils/fakeEventsCollection');
const { adminSession } = require('../../testUtils/adminSessions');
const listRoute = require('../../app/api/admin/events/route');
const itemRoute = require('../../app/api/admin/events/[id]/route');

const request = (url, body) => ({
  nextUrl: new URL(url),
  async json() {
    if (body instanceof Error) throw body;
    return body;
  },
});
const context = (id) => ({ params: Promise.resolve({ id }) });
const day = (key) => new Date(`${key}T00:00:00.000Z`);
const valid = { name: 'Race', startDate: '2026-06-01', endDate: '2026-06-02', details: 'Details' };
const expectRevalidated = () => {
  expect(revalidateTag).toHaveBeenNthCalledWith(1, 'events', { expire: 0 });
  expect(revalidateTag).toHaveBeenNthCalledWith(2, 'home-snapshot', { expire: 0 });
};

describe('admin events API', () => {
  let collection;
  let existing;

  beforeEach(() => {
    jest.clearAllMocks();
    existing = { _id: new ObjectId(), event_name: 'Race', event_start_date: day('2024-05-01'), event_end_date: day('2024-05-02'), event_details: 'Old race' };
    collection = createEventsCollection([existing]);
    connectToDatabase.mockResolvedValue({ db: { collection: () => collection } });
    getServerSession.mockResolvedValue(adminSession());
  });

  describe('GET /api/admin/events', () => {
    test('lists past events (not just the public upcoming feed) with paging metadata and no caching', async () => {
      const res = await listRoute.GET(request('http://localhost/api/admin/events?scope=past&page=1&pageSize=10'));
      const payload = await res.json();
      expect(res.status).toBe(200);
      expect(res.headers['Cache-Control']).toBe('private, no-store');
      expect(payload.data).toEqual(expect.objectContaining({ scope: 'past', page: 1, pageSize: 10, total: 1, totalPages: 1 }));
      expect(payload.data.events).toEqual([{ id: existing._id.toString(), name: 'Race', startDate: '2024-05-01', endDate: '2024-05-02', details: 'Old race', timing: 'past' }]);
    });

    test.each(['pageSize=500', 'page=-1', 'scope=everything'])('rejects %s with a 400', async (query) => {
      const res = await listRoute.GET(request(`http://localhost/api/admin/events?${query}`));
      expect(res.status).toBe(400);
      expect(collection.find).not.toHaveBeenCalled();
    });

    test('a database failure is a generic 500', async () => {
      connectToDatabase.mockRejectedValue(new Error('mongodb://user:secret@host refused'));
      const res = await listRoute.GET(request('http://localhost/api/admin/events'));
      expect(res.status).toBe(500);
      expect((await res.json()).error.message).toBe('Internal Server Error');
    });
  });

  describe('POST /api/admin/events', () => {
    test('creates a new event even when one with the same name exists, and refreshes caches', async () => {
      const res = await listRoute.POST(request('http://localhost/api/admin/events', valid));
      const payload = await res.json();

      expect(res.status).toBe(201);
      expect(payload.data.message).toBe('Event created');
      expect(payload.data.event).toEqual(expect.objectContaining({ name: 'Race', startDate: '2026-06-01', endDate: '2026-06-02' }));
      expect(payload.data.event.id).not.toBe(existing._id.toString());
      expect(collection.docs).toHaveLength(2);
      expect(existing.event_details).toBe('Old race');
      expectRevalidated();
    });

    test('the legacy name-matching payload cannot overwrite an event', async () => {
      const res = await listRoute.POST(request('http://localhost/api/admin/events', { ...valid, id: existing._id.toString() }));
      expect(res.status).toBe(400);
      expect(existing.event_details).toBe('Old race');
      expect(collection.docs).toHaveLength(1);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    test('invalid dates are rejected with a useful message and nothing is written', async () => {
      const res = await listRoute.POST(request('http://localhost/api/admin/events', { ...valid, startDate: '2026-06-03' }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('End date can’t be before the start date.');
      expect(collection.insertOne).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    test('a malformed body is a 400', async () => {
      const res = await listRoute.POST(request('http://localhost/api/admin/events', new SyntaxError('bad json')));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('Invalid request body');
    });
  });

  describe('PUT /api/admin/events/[id]', () => {
    test('updates the identified event and refreshes caches', async () => {
      const res = await itemRoute.PUT(request('http://localhost/api/admin/events/x', { ...valid, details: 'New details' }), context(existing._id.toString()));
      const payload = await res.json();
      expect(res.status).toBe(200);
      expect(payload.data).toEqual(expect.objectContaining({ message: 'Event updated', changed: true }));
      expect(payload.data.event.id).toBe(existing._id.toString());
      expect(existing.event_details).toBe('New details');
      expect(existing.event_start_date).toEqual(day('2026-06-01'));
      expect(collection.docs).toHaveLength(1);
      expectRevalidated();
    });

    test('an unchanged save succeeds without invalidating caches', async () => {
      const id = existing._id.toString();
      await itemRoute.PUT(request('http://localhost/api/admin/events/x', valid), context(id));
      jest.clearAllMocks();
      const res = await itemRoute.PUT(request('http://localhost/api/admin/events/x', valid), context(id));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual(expect.objectContaining({ message: 'No changes to save', changed: false }));
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    test('an unknown id is a 404 and creates no duplicate', async () => {
      const res = await itemRoute.PUT(request('http://localhost/api/admin/events/x', valid), context(new ObjectId().toString()));
      expect(res.status).toBe(404);
      expect((await res.json()).error.message).toBe('Event not found');
      expect(collection.docs).toHaveLength(1);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    test.each([undefined, 'evt-1', 'Race'])('an invalid id %p is a 400 and never matches by name', async (id) => {
      const res = await itemRoute.PUT(request('http://localhost/api/admin/events/x', { ...valid, details: 'Hijack' }), context(id));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('Invalid event id');
      expect(existing.event_details).toBe('Old race');
      expect(collection.docs).toHaveLength(1);
    });

    test('invalid content leaves the saved event intact', async () => {
      const res = await itemRoute.PUT(request('http://localhost/api/admin/events/x', { ...valid, name: '', endDate: '2026-02-30' }), context(existing._id.toString()));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toBe('Event name is required. End date must be a real date in YYYY-MM-DD format.');
      expect(existing.event_name).toBe('Race');
      expect(revalidateTag).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/events/[id]', () => {
    test('deletes the identified event and refreshes caches', async () => {
      const res = await itemRoute.DELETE(request('http://localhost/api/admin/events/x'), context(existing._id.toString()));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ message: 'Event deleted', deleted: true, id: existing._id.toString() });
      expect(collection.docs).toHaveLength(0);
      expectRevalidated();
    });

    test('an unknown id is a 404 without cache refresh', async () => {
      const res = await itemRoute.DELETE(request('http://localhost/api/admin/events/x'), context(new ObjectId().toString()));
      expect(res.status).toBe(404);
      expect(revalidateTag).not.toHaveBeenCalled();
    });

    test('an invalid id is a 400', async () => {
      const res = await itemRoute.DELETE(request('http://localhost/api/admin/events/x'), context('abc'));
      expect(res.status).toBe(400);
      expect(collection.deleteOne).not.toHaveBeenCalled();
    });
  });

  test('a failed cache invalidation does not turn a persisted write into an error', async () => {
    revalidateTag.mockImplementationOnce(() => { throw new Error('Cache unavailable'); });
    const res = await listRoute.POST(request('http://localhost/api/admin/events', valid));
    expect(res.status).toBe(201);
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenLastCalledWith('home-snapshot', { expire: 0 });
    expect(console.warn).toHaveBeenCalled();
  });

  test.each([
    ['GET', () => listRoute.GET(request('http://localhost/api/admin/events'))],
    ['POST', () => listRoute.POST(request('http://localhost/api/admin/events', valid))],
    ['PUT', () => itemRoute.PUT(request('http://localhost/api/admin/events/x', valid), context(existing._id.toString()))],
    ['DELETE', () => itemRoute.DELETE(request('http://localhost/api/admin/events/x'), context(existing._id.toString()))],
  ])('%s without a session is a 401 that reveals no records', async (_method, call) => {
    getServerSession.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: { message: 'Unauthorized' } });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
