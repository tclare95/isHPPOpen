const { GET } = require('../../app/api/featureflags/route');

describe('/api/featureflags route handler', () => {
  it('returns 404 on GET', async () => {
    const res = await GET();
    const payload = await res.json();
    expect(res.status).toBe(404);
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Not Found');
  });
});
