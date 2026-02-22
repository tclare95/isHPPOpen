jest.mock('../../libs/services/hppStatusService');

const { getHppStatusSnapshot } = require('../../libs/services/hppStatusService');
const { GET } = require('../../app/api/hppstatus/route');

describe('HPP Status API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns HPP status data', async () => {
    getHppStatusSnapshot.mockResolvedValue({
      data: {
        currentStatus: true,
        lastChangedDate: '2026-02-01',
        closuresInLast7Days: 0,
        closuresInLast28Days: 1,
        closuresInLast182Days: 5,
        closuresInLast365Days: 10,
      },
      context: { isEmpty: false, hasClosureRecord: true },
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toHaveProperty('currentStatus');
  });

  test('returns empty state when no records', async () => {
    getHppStatusSnapshot.mockResolvedValue({
      data: { isEmpty: true, currentStatus: null, closuresInLast7Days: 0 },
      context: { isEmpty: true, hasClosureRecord: false },
    });

    const res = await GET();
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.data.isEmpty).toBe(true);
  });
});