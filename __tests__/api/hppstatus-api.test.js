/** @jest-environment node */
import handler from '../../pages/api/hppstatus';
import { connectToDatabase } from '../../libs/database';
import { createMocks } from 'node-mocks-http';

jest.mock('../../libs/database');

describe('hppstatus API handler', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-06-21T00:00:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('responds with computed status', async () => {
    const now = new Date('2025-06-21T00:00:00Z');
    const records = [
      { timestamp: new Date(now.getTime() - 2 * 86400000).toISOString(), value: false },
      { timestamp: new Date(now.getTime() - 1 * 86400000).toISOString(), value: true }
    ];
    const collection = {
      find: jest.fn(() => ({ toArray: jest.fn().mockResolvedValue(records) }))
    };
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => collection) } });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      currentStatus: true,
      lastChangedDate: '2025-06-19',
      effectiveLastOpenDate: '2025-06-19',
      closuresInLast7Days: 1,
      closuresInLast28Days: 1,
      closuresInLast182Days: 1,
      closuresInLast365Days: 1,
    });
  });
});
