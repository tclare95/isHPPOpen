const { GET } = require('../../app/api/forecaststability/route');

// Sample stability CSV data
const mockStabilityCSV = `target_time,forecast_current,forecast_1h_ago,forecast_2h_ago,forecast_3h_ago,forecast_4h_ago,forecast_5h_ago,forecast_6h_ago,forecast_7h_ago,forecast_8h_ago,forecast_9h_ago,forecast_10h_ago,forecast_11h_ago,forecast_12h_ago,stability_std,stability_range,revision_trend
2025-12-06T12:00:00Z,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,1.37,1.36,1.35,1.34,1.33,0.035,0.12,0.008
2025-12-06T14:00:00Z,1.50,1.49,1.48,1.47,1.46,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,0.040,0.12,-0.005`;

describe('Forecast Stability API route handler', () => {
  const originalEnv = process.env;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    console.log = jest.fn();
    console.error = jest.fn();
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.restoreAllMocks();
  });

  test('GET returns parsed stability data', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';
    
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockStabilityCSV),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    const data = payload.data;
    
    expect(data.stability_data).toHaveLength(2);
    expect(data.stability_data[0]).toMatchObject({
      target_time: '2025-12-06T12:00:00Z',
      forecast_current: 1.45,
      stability_std: 0.035,
      stability_range: 0.12,
      revision_trend: 0.008,
    });
    expect(data.stability_data[0].historical_forecasts).toHaveLength(12);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://test-bucket.s3.amazonaws.com/stability.csv',
      { next: { revalidate: 900 } }
    );
  });

  test('GET returns 500 when S3_FORECAST_STABILITY_URL is not set', async () => {
    delete process.env.S3_FORECAST_STABILITY_URL;

    const res = await GET();
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Forecast stability source is not configured');
  });

  test('GET returns 502 when S3 fetch fails', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';
    
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await GET();
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Unable to fetch forecast stability data');
  });

  test('GET returns 502 when the stability payload is invalid', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';

    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('target_time,forecast_current\n2025-12-06T12:00:00Z,not-a-number'),
    });

    const res = await GET();
    expect(res.status).toBe(502);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.message).toBe('Invalid forecast stability payload');
  });

  test('GET returns empty array for a true empty dataset', async () => {
    process.env.S3_FORECAST_STABILITY_URL = 'https://test-bucket.s3.amazonaws.com/stability.csv';

    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('target_time,forecast_current'),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.stability_data).toEqual([]);
  });

  test('route exposes GET handler', async () => {
    expect(typeof GET).toBe('function');
  });
});
