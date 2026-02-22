import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/featureflags';

describe('/api/featureflags', () => {
  it('returns 404 on GET request because feature flags were removed', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const payload = JSON.parse(res._getData());
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Not Found');
  });

  it('returns 404 for non-GET requests', async () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      const { req, res } = createMocks({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const payload = JSON.parse(res._getData());
      expect(payload.ok).toBe(false);
      expect(payload.error.message).toBe('Not Found');
    }
  });
});
