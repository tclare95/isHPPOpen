jest.mock('../../libs/services/operationalOverviewService', () => ({ getOperationalOverview: jest.fn() }));

const { getServerSession } = require('next-auth');
const { getOperationalOverview } = require('../../libs/services/operationalOverviewService');
const { GET } = require('../../app/api/admin/operational-overview/route');
const { adminSession, nonAdminSession } = require('../../testUtils/adminSessions');

const overview = {
  checkedAt: '2026-11-18T12:00:00.000Z',
  components: [{ key: 'alertEvaluation', label: 'Alert evaluation', state: 'unknown', attention: true, summary: 'Not checked', evidenceAt: null, reasons: [], facts: [], links: [] }],
};

describe('Operational overview API route handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOperationalOverview.mockResolvedValue(overview);
  });

  test('returns the overview to an admin without caching it', async () => {
    getServerSession.mockResolvedValue(adminSession());
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Cache-Control': 'no-store' });
    expect(await response.json()).toEqual({ ok: true, data: overview });
    expect(getOperationalOverview).toHaveBeenCalledTimes(1);
  });

  test('returns 401 without a session and reads nothing', async () => {
    getServerSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: { message: 'Unauthorized' } });
    expect(getOperationalOverview).not.toHaveBeenCalled();
  });

  test('returns 403 for a signed-in non-admin and reads nothing', async () => {
    getServerSession.mockResolvedValue(nonAdminSession());
    const response = await GET();
    expect(response.status).toBe(403);
    expect(getOperationalOverview).not.toHaveBeenCalled();
  });

  test('maps an unexpected failure to the standard error envelope without its details', async () => {
    getServerSession.mockResolvedValue(adminSession());
    getOperationalOverview.mockRejectedValue(new Error('mongodb+srv://user:secret@host'));
    const response = await GET();
    const payload = await response.json();
    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('secret');
  });
});
