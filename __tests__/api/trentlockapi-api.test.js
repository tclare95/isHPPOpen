jest.mock('../../libs/services/trentLockService');

const { recordTrentLockSubmission } = require('../../libs/services/trentLockService');
const { HttpError } = require('../../libs/api/http');
const { POST } = require('../../app/api/trentlockapi/route');

const makeRequest = (body) => ({
  async json() {
    return body;
  },
});

describe('Trent Lock API route handler', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST records a submission', async () => {
    const body = {
      dateTime: '2026-03-08T10:00:00Z',
      range: 'Medium',
      comments: 'Nice conditions',
      boatType: 'K1',
    };

    recordTrentLockSubmission.mockResolvedValue({
      message: 'Update successful',
      id: 'trent-1',
    });

    const res = await POST(makeRequest(body));
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.id).toBe('trent-1');
    expect(recordTrentLockSubmission).toHaveBeenCalledWith(body);
  });

  test('POST maps service errors', async () => {
    recordTrentLockSubmission.mockRejectedValue(new HttpError(500, 'Failed to save data'));

    const res = await POST(makeRequest({ dateTime: '2026-03-08T10:00:00Z' }));
    const payload = await res.json();

    expect(res.status).toBe(500);
    expect(payload.error.message).toBe('Failed to save data');
  });
});