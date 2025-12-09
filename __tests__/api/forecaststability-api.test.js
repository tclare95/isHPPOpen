const { createMocks } = require('node-mocks-http');
const forecaststabilityHandler = require('../../pages/api/forecaststability').default;

// Sample stability CSV data
const mockStabilityCSV = `target_time,forecast_current,forecast_1h_ago,forecast_2h_ago,forecast_3h_ago,forecast_4h_ago,forecast_5h_ago,forecast_6h_ago,forecast_7h_ago,forecast_8h_ago,forecast_9h_ago,forecast_10h_ago,forecast_11h_ago,forecast_12h_ago,stability_std,stability_range,revision_trend
2025-12-06T12:00:00Z,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,1.37,1.36,1.35,1.34,1.33,0.035,0.12,0.008
2025-12-06T14:00:00Z,1.50,1.49,1.48,1.47,1.46,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,0.040,0.12,-0.005`;

describe('Forecast Stability API', () => {
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    console.log = jest.fn();
    console.error = jest.fn();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.restoreAllMocks();
  });

  test('GET returns parsed stability data', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockStabilityCSV),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecaststabilityHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const data = JSON.parse(res._getData());
    
    expect(data.stability_data).toHaveLength(2);
    expect(data.stability_data[0]).toMatchObject({
      target_time: '2025-12-06T12:00:00Z',
      forecast_current: 1.45,
      stability_std: 0.035,
      stability_range: 0.12,
      revision_trend: 0.008,
    });
    expect(data.stability_data[0].historical_forecasts).toHaveLength(12);
  });

  test('GET returns 500 when S3_FORECAST_STABILITY_URL not set', async () => {
    delete process.env.S3_FORECAST_STABILITY_URL;

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecaststabilityHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Stability URL not configured');
  });

  test('GET returns 502 when S3 fetch fails', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecaststabilityHandler(req, res);

    expect(res._getStatusCode()).toBe(502);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Failed to fetch stability data');
  });

  test('POST method not allowed', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await forecaststabilityHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
