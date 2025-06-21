/** @jest-environment node */
import handler from '../../pages/api/events';
import { connectToDatabase } from '../../libs/database';
import { createMocks } from 'node-mocks-http';

jest.mock('../../libs/database');

describe('events API handler', () => {
  it('responds with event data on GET', async () => {
    const date = new Date('2025-06-21T00:00:00Z');
    const mockEvents = [{ event_name: 'Demo', event_end_date: date }];
    const toArray = jest.fn().mockResolvedValue(mockEvents);
    const sort = jest.fn().mockReturnValue({ toArray });
    const limit = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ limit });
    const collection = { find };
    connectToDatabase.mockResolvedValue({ db: { collection: jest.fn(() => collection) } });

    const { req, res } = createMocks({ method: 'GET', query: { limit: '1' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      count: 1,
      eventsArray: [{ event_name: 'Demo', event_end_date: date.toISOString() }],
    });
  });
});
