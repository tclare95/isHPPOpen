/** @jest-environment node */
jest.mock('mongodb', () => jest.requireActual('mongodb'));
jest.mock('../libs/database', () => ({ connectToDatabase: jest.fn() }));

const { ObjectId } = require('mongodb');
const { connectToDatabase } = require('../libs/database');
const { createEventsCollection: createCollection } = require('../testUtils/fakeEventsCollection');
const {
  buildAdminEventsQuery,
  createEvent,
  deleteEventById,
  listAdminEvents,
  parseAdminEventsQuery,
  toAdminEvent,
  updateEventById,
  validateEventInput,
  ADMIN_EVENTS_MAX_PAGE_SIZE,
} = require('../libs/services/eventsService');

const day = (key) => new Date(`${key}T00:00:00.000Z`);
const event = (name, start, end, extra = {}) => ({ _id: new ObjectId(), event_name: name, event_start_date: day(start), event_end_date: day(end), event_details: `${name} details`, ...extra });
const input = (overrides = {}) => ({ name: 'Race', startDate: '2026-06-01', endDate: '2026-06-02', details: 'Details', ...overrides });
// 18 Nov 2026, 10:00 UK time.
const NOW = new Date('2026-11-18T10:00:00.000Z');

describe('events service', () => {
  let collection;

  function useDocs(docs) {
    collection = createCollection(docs);
    connectToDatabase.mockResolvedValue({ db: { collection: () => collection } });
  }

  beforeEach(() => useDocs([]));

  describe('admin listing', () => {
    const pastEvent = event('Spring Slalom', '2024-04-30', '2024-05-01');
    const yesterdayEnd = event('Ended yesterday', '2026-11-15', '2026-11-17');
    const running = event('Running now', '2026-11-17', '2026-11-19');
    const endsToday = event('Ends today', '2026-11-18', '2026-11-18');
    const tomorrow = event('Starts tomorrow', '2026-11-19', '2026-11-19');
    const farFuture = event('Next year', '2027-05-01', '2027-05-02');

    beforeEach(() => useDocs([farFuture, pastEvent, running, tomorrow, yesterdayEnd, endsToday]));
    const names = (result) => result.events.map((item) => item.name);

    test('upcoming lists events starting after today, soonest first', async () => {
      expect(names(await listAdminEvents({ scope: 'upcoming' }, NOW))).toEqual(['Starts tomorrow', 'Next year']);
    });

    test('current lists events spanning today, including one ending today', async () => {
      expect(names(await listAdminEvents({ scope: 'current' }, NOW))).toEqual(['Running now', 'Ends today']);
    });

    test('past lists ended events, most recent first, beyond the public feed', async () => {
      expect(names(await listAdminEvents({ scope: 'past' }, NOW))).toEqual(['Ended yesterday', 'Spring Slalom']);
    });

    test('all lists everything, newest first, and searches name and details case-insensitively', async () => {
      const all = await listAdminEvents({ scope: 'all' }, NOW);
      expect(all.total).toBe(6);
      expect(names(all)[0]).toBe('Next year');
      expect(names(await listAdminEvents({ scope: 'all', q: 'SLALOM' }, NOW))).toEqual(['Spring Slalom']);
      expect(names(await listAdminEvents({ scope: 'all', q: 'now details' }, NOW))).toEqual(['Running now']);
    });

    test('search text is matched literally, not as a regular expression', async () => {
      expect((await listAdminEvents({ scope: 'all', q: '.*' }, NOW)).total).toBe(0);
    });

    test('pages with a bounded size and reports totals', async () => {
      const first = await listAdminEvents({ scope: 'all', page: '1', pageSize: '4' }, NOW);
      const second = await listAdminEvents({ scope: 'all', page: '2', pageSize: '4' }, NOW);
      expect(first).toEqual(expect.objectContaining({ page: 1, pageSize: 4, total: 6, totalPages: 2 }));
      expect(first.events).toHaveLength(4);
      expect(second.events).toHaveLength(2);
      expect(collection.calls).toContainEqual({ skip: 4 });
    });

    test('defaults to the upcoming scope with 20 per page', async () => {
      const result = await listAdminEvents({}, NOW);
      expect(result).toEqual(expect.objectContaining({ scope: 'upcoming', page: 1, pageSize: 20 }));
    });

    test.each([
      [{ pageSize: String(ADMIN_EVENTS_MAX_PAGE_SIZE + 1) }, /pageSize/],
      [{ pageSize: '0' }, /pageSize/],
      [{ page: '0' }, /page/],
      [{ page: '1.5' }, /page/],
      [{ page: 'abc' }, /page/],
      [{ scope: 'deleted' }, /scope/],
      [{ q: 'x'.repeat(101) }, /q must be/],
    ])('rejects %o with a 400 before reading', async (params, message) => {
      await expect(listAdminEvents(params, NOW)).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) });
      expect(collection.countDocuments).not.toHaveBeenCalled();
    });

    test('accepts the maximum page size', () => {
      expect(parseAdminEventsQuery({ pageSize: String(ADMIN_EVENTS_MAX_PAGE_SIZE) }).pageSize).toBe(ADMIN_EVENTS_MAX_PAGE_SIZE);
    });

    test('scopes follow the UK calendar day, not UTC', () => {
      // 00:30 UK on 1 July is still 30 June in UTC.
      const { filter } = buildAdminEventsQuery({ scope: 'past' }, new Date('2026-06-30T23:30:00.000Z'));
      expect(filter.event_end_date.$lt.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    });
  });

  describe('editor representation', () => {
    test('stored dates become UK date-only values, including legacy UK-midnight values', () => {
      const legacy = { _id: new ObjectId(), event_name: 'Legacy', event_start_date: new Date('2024-04-29T23:00:00.000Z'), event_end_date: new Date('2024-05-01T00:00:00.000Z'), event_details: 'x' };
      expect(toAdminEvent(legacy, NOW)).toEqual({ id: legacy._id.toString(), name: 'Legacy', startDate: '2024-04-30', endDate: '2024-05-01', details: 'x', timing: 'past' });
    });

    test('a saved date-only value round-trips unchanged across BST', async () => {
      const created = await createEvent(input({ startDate: '2026-03-29', endDate: '2026-10-25' }));
      expect(created).toEqual(expect.objectContaining({ startDate: '2026-03-29', endDate: '2026-10-25' }));
      expect(collection.docs[0].event_start_date.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    });
  });

  describe('create', () => {
    test('always inserts, never overwriting an existing event with the same name', async () => {
      const existing = event('Race', '2026-05-01', '2026-05-01');
      useDocs([existing]);
      const created = await createEvent(input({ name: 'Race', details: 'Second race' }));

      expect(collection.insertOne).toHaveBeenCalledTimes(1);
      expect(collection.updateOne).not.toHaveBeenCalled();
      expect(collection.docs).toHaveLength(2);
      expect(collection.docs[0]).toEqual(existing);
      expect(created.id).not.toBe(existing._id.toString());
      expect(created).toEqual(expect.objectContaining({ name: 'Race', details: 'Second race', startDate: '2026-06-01' }));
    });

    test('rejects a payload carrying an id rather than treating it as an update', async () => {
      await expect(createEvent(input({ id: new ObjectId().toString() }))).rejects.toMatchObject({ statusCode: 400 });
      expect(collection.insertOne).not.toHaveBeenCalled();
    });

    test('trims text and stores the established field names', async () => {
      await createEvent(input({ name: '  Race  ', details: ' Details ' }));
      expect(collection.docs[0]).toEqual(expect.objectContaining({ event_name: 'Race', event_details: 'Details' }));
    });
  });

  describe('validation', () => {
    test.each([
      [{ name: '  ' }, 'Event name is required.'],
      [{ details: '' }, 'Event details are required.'],
      [{ startDate: '' }, 'Start date is required.'],
      [{ endDate: undefined }, 'End date is required.'],
      [{ startDate: '2026-02-30' }, 'Start date must be a real date in YYYY-MM-DD format.'],
      [{ endDate: 'next Tuesday' }, 'End date must be a real date in YYYY-MM-DD format.'],
      [{ startDate: '2026-06-02', endDate: '2026-06-01' }, 'End date can’t be before the start date.'],
      [{ name: 'x'.repeat(201) }, 'Event name must be 200 characters or fewer.'],
    ])('rejects %o with a useful message', (overrides, message) => {
      expect(() => validateEventInput(input(overrides))).toThrow(expect.objectContaining({ statusCode: 400, message: expect.stringContaining(message) }));
    });

    test('reports every problem at once', () => {
      expect(() => validateEventInput({})).toThrow('Event name is required. Start date is required. End date is required. Event details are required.');
    });

    test('accepts a single-day event', () => {
      expect(validateEventInput(input({ startDate: '2026-06-01', endDate: '2026-06-01' })).event_end_date).toEqual(day('2026-06-01'));
    });
  });

  describe('update by id', () => {
    test('updates exactly the identified event, leaving a same-named event alone', async () => {
      const target = event('Race', '2026-05-01', '2026-05-01');
      const sameName = event('Race', '2026-07-01', '2026-07-01');
      useDocs([sameName, target]);

      const result = await updateEventById(target._id.toString(), input({ name: 'Race', details: 'Updated' }));

      expect(collection.updateOne).toHaveBeenCalledWith({ _id: target._id }, expect.any(Object), { upsert: false });
      expect(result).toEqual({ event: expect.objectContaining({ id: target._id.toString(), details: 'Updated' }), changed: true });
      expect(target.event_details).toBe('Updated');
      expect(sameName.event_details).toBe('Race details');
      expect(collection.docs).toHaveLength(2);
    });

    test('reports an unchanged save', async () => {
      const target = event('Race', '2026-06-01', '2026-06-02', { event_details: 'Details' });
      useDocs([target]);
      expect((await updateEventById(target._id.toString(), input())).changed).toBe(false);
    });

    test('an unknown id is a 404 and creates nothing', async () => {
      useDocs([event('Race', '2026-05-01', '2026-05-01')]);
      await expect(updateEventById(new ObjectId().toString(), input())).rejects.toMatchObject({ statusCode: 404, message: 'Event not found' });
      expect(collection.docs).toHaveLength(1);
      expect(collection.insertOne).not.toHaveBeenCalled();
    });

    test.each([undefined, '', 'evt-1', 'Race', '12345', `${'a'.repeat(24)}x`])('an invalid id %p is a 400 and never falls back to the name', async (id) => {
      const existing = event('Race', '2026-05-01', '2026-05-01');
      useDocs([existing]);
      await expect(updateEventById(id, input({ name: 'Race' }))).rejects.toMatchObject({ statusCode: 400, message: 'Invalid event id' });
      expect(collection.updateOne).not.toHaveBeenCalled();
      expect(collection.insertOne).not.toHaveBeenCalled();
    });

    test('invalid content leaves the stored event untouched', async () => {
      const target = event('Race', '2026-05-01', '2026-05-01');
      const before = { ...target };
      useDocs([target]);
      await expect(updateEventById(target._id.toString(), input({ startDate: '2026-06-03', endDate: '2026-06-01' }))).rejects.toMatchObject({ statusCode: 400 });
      expect(collection.updateOne).not.toHaveBeenCalled();
      expect(target).toEqual(before);
    });
  });

  describe('delete by id', () => {
    test('deletes exactly the identified event', async () => {
      const target = event('Race', '2026-05-01', '2026-05-01');
      const other = event('Race', '2026-06-01', '2026-06-01');
      useDocs([target, other]);
      expect(await deleteEventById(target._id.toString())).toEqual({ id: target._id.toString() });
      expect(collection.docs).toEqual([other]);
    });

    test('an unknown id is a 404', async () => {
      await expect(deleteEventById(new ObjectId().toString())).rejects.toMatchObject({ statusCode: 404 });
    });

    test('an invalid id is a 400 without touching the collection', async () => {
      await expect(deleteEventById('abc')).rejects.toMatchObject({ statusCode: 400 });
      expect(collection.deleteOne).not.toHaveBeenCalled();
    });
  });
});
