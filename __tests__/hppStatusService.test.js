jest.mock('../libs/database');

const { connectToDatabase } = require('../libs/database');
const {
  buildEmptyStatusPayload,
  calculateHppStatus,
  getHistoryWindowStart,
  getHppStatusSnapshot,
} = require('../libs/services/hppStatusService');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T12:00:00.000Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * DAY_MS);
const open = (days) => ({ timestamp: daysAgo(days), value: true });
const closed = (days) => ({ timestamp: daysAgo(days), value: false });

const closures = (data) => ({
  7: data.closuresInLast7Days,
  28: data.closuresInLast28Days,
  182: data.closuresInLast182Days,
  365: data.closuresInLast365Days,
});

// Fake openIndicator collection that answers the two queries the service is
// allowed to make, so tests also prove there is no unbounded history scan.
function mockOpenIndicator(records) {
  const find = jest.fn((query) => ({
    toArray: async () => records.filter((record) => record.timestamp instanceof Date && record.timestamp >= query.timestamp.$gte),
  }));
  const findOne = jest.fn(async (query) => records
    .filter((record) => record.timestamp instanceof Date
      && record.timestamp < query.timestamp.$lt
      && query.value.$in.includes(record.value))
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null);
  connectToDatabase.mockResolvedValue({ db: { collection: jest.fn().mockReturnValue({ find, findOne }) } });
  return { find, findOne };
}

describe('hppStatusService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getHppStatusSnapshot', () => {
    test('queries only the history window plus the single latest earlier transition', async () => {
      const { find, findOne } = mockOpenIndicator([closed(30), open(20)]);

      await getHppStatusSnapshot({ now: NOW });

      const historyStart = getHistoryWindowStart(NOW);
      expect(historyStart).toEqual(daysAgo(365));
      expect(find).toHaveBeenCalledTimes(1);
      expect(find).toHaveBeenCalledWith({ timestamp: { $gte: historyStart } });
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenCalledWith(
        { timestamp: { $lt: historyStart }, value: { $in: [true, false] } },
        { sort: { timestamp: -1 } },
      );
    });

    test('carries a closure from before the year through windows with no transitions', async () => {
      mockOpenIndicator([open(500), closed(400)]);

      const { data, context } = await getHppStatusSnapshot({ now: NOW });

      expect(context).toEqual({ isEmpty: false, hasClosureRecord: true });
      expect(data).toMatchObject({
        isEmpty: false,
        currentStatus: false,
        lastChangedAt: daysAgo(400).toISOString(),
        lastChangedDate: daysAgo(400).toISOString().slice(0, 10),
        effectiveLastOpenAt: daysAgo(400).toISOString(),
      });
      expect(closures(data)).toEqual({ 7: 7, 28: 28, 182: 182, 365: 365 });
    });

    test('carries an unchanged open status rather than reporting an empty state', async () => {
      const { findOne } = mockOpenIndicator([closed(420), open(400)]);

      const { data, context } = await getHppStatusSnapshot({ now: NOW });

      // Only the single latest pre-window record is read, so the older closure
      // is deliberately not looked up: last-closure fields stay null, as before.
      await expect(findOne.mock.results[0].value).resolves.toEqual(open(400));
      expect(context).toEqual({ isEmpty: false, hasClosureRecord: false });
      expect(data.isEmpty).toBe(false);
      expect(data.currentStatus).toBe(true);
      expect(data.lastChangedAt).toBeNull();
      expect(closures(data)).toEqual({ 7: 0, 28: 0, 182: 0, 365: 0 });
      expect(data.health).toMatchObject({ source: 'mongodb-hpp-status', state: 'fresh' });
    });

    test('counts a closure from the window start when it began before the window', async () => {
      mockOpenIndicator([closed(400), open(300)]);

      const { data } = await getHppStatusSnapshot({ now: NOW });

      expect(data.currentStatus).toBe(true);
      expect(closures(data)).toEqual({ 7: 0, 28: 0, 182: 0, 365: 65 });
    });

    test('returns the existing empty payload shape when there are no records at all', async () => {
      mockOpenIndicator([]);

      const { data, context } = await getHppStatusSnapshot({ now: NOW });

      expect(context).toEqual({ isEmpty: true, hasClosureRecord: false });
      expect(Object.keys(data)).toEqual(Object.keys(buildEmptyStatusPayload()));
      expect(data).toMatchObject({ isEmpty: true, currentStatus: null, closuresInLast365Days: 0 });
      expect(data.health).toMatchObject({ source: 'mongodb-hpp-status', state: 'fresh' });
    });

    test('keeps the public payload keys and order for populated status', async () => {
      mockOpenIndicator([closed(10), open(3)]);

      const { data } = await getHppStatusSnapshot({ now: NOW });

      expect(Object.keys(data)).toEqual(Object.keys(buildEmptyStatusPayload()));
    });

    test('ignores invalid records, including a carried-in record with an invalid value', async () => {
      mockOpenIndicator([
        closed(420),
        { timestamp: daysAgo(380), value: null },
        { timestamp: 'not-a-date', value: false },
        { timestamp: daysAgo(30), value: 'false' },
        { timestamp: daysAgo(20) },
      ]);

      const { data } = await getHppStatusSnapshot({ now: NOW });

      expect(data.currentStatus).toBe(false);
      expect(data.lastChangedAt).toBe(daysAgo(420).toISOString());
      expect(closures(data)).toEqual({ 7: 7, 28: 28, 182: 182, 365: 365 });
    });
  });

  describe('calculateHppStatus', () => {
    test('gives each rolling window the status in force at its own start', () => {
      // Closed 10 days ago, reopened 3 days ago: the 7-day window starts closed.
      const status = calculateHppStatus([open(400), closed(10), open(3)], NOW);

      expect(status.currentStatus).toBe(true);
      expect(closures(status)).toEqual({ 7: 4, 28: 7, 182: 7, 365: 7 });
    });

    test('counts an ongoing closure up to now and caps each window at its length', () => {
      const status = calculateHppStatus([closed(200)], NOW);

      expect(status.currentStatus).toBe(false);
      expect(closures(status)).toEqual({ 7: 7, 28: 28, 182: 182, 365: 200 });
    });

    test('handles closures that start or end exactly on window boundaries', () => {
      expect(closures(calculateHppStatus([closed(28), open(21)], NOW))).toEqual({ 7: 0, 28: 7, 182: 7, 365: 7 });
      expect(closures(calculateHppStatus([closed(40), open(28)], NOW))).toEqual({ 7: 0, 28: 0, 182: 12, 365: 12 });
      expect(closures(calculateHppStatus([closed(365), open(360)], NOW))).toEqual({ 7: 0, 28: 0, 182: 0, 365: 5 });
      expect(closures(calculateHppStatus([closed(190), open(175)], NOW))).toEqual({ 7: 0, 28: 0, 182: 7, 365: 15 });
    });

    test('does not restart a closure on repeated closed records or count repeated open records', () => {
      const status = calculateHppStatus([open(400), closed(20), closed(10), open(5), open(2)], NOW);

      expect(status.currentStatus).toBe(true);
      expect(status.lastChangedAt).toBe(daysAgo(10).toISOString());
      // Closed from 20 to 5 days ago: the 7-day window starts inside that closure.
      expect(closures(status)).toEqual({ 7: 2, 28: 15, 182: 15, 365: 15 });
    });

    test('keeps the existing rounding of partial closure days up to whole days', () => {
      const status = calculateHppStatus([closed(2.5)], NOW);

      expect(closures(status)).toEqual({ 7: 3, 28: 3, 182: 3, 365: 3 });
    });

    test('sorts unordered input before deriving status', () => {
      const status = calculateHppStatus([open(3), closed(400), closed(10), open(300)], NOW);

      expect(status.currentStatus).toBe(true);
      expect(closures(status)).toEqual({ 7: 4, 28: 7, 182: 7, 365: 72 });
    });

    test('returns null when no record is valid', () => {
      expect(calculateHppStatus([], NOW)).toBeNull();
      expect(calculateHppStatus([{ timestamp: 'bad', value: true }, { timestamp: daysAgo(1), value: 0 }], NOW)).toBeNull();
    });
  });
});
