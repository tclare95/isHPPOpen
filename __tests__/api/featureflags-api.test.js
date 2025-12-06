import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/featureflags';

describe('/api/featureflags', () => {
  it('returns feature flags on GET request', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('USE_S3_FORECAST');
    expect(data).toHaveProperty('SHOW_FORECAST_CONFIDENCE');
    expect(typeof data.USE_S3_FORECAST).toBe('boolean');
    expect(typeof data.SHOW_FORECAST_CONFIDENCE).toBe('boolean');
  });

  it('returns 405 for non-GET requests', async () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      const { req, res } = createMocks({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({
        error: `Method ${method} Not Allowed`,
      });
    }
  });
});
