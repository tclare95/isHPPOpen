const { createMocks } = require('node-mocks-http');
const forecastAccuracyHandler = require('../../pages/api/forecastaccuracy').default;

// Sample CSV data matching the format from S3
const mockCSVData = `evaluation_time,horizon_hours,forecast_made_at,predictions_compared,mae,rmse,bias,max_error
2025-12-05T14:00:00+00:00,2,2025-12-05T12:00:00+00:00,7,0.0233,0.0238,0.0233,0.03
2025-12-05T14:00:00+00:00,8,2025-12-05T06:00:00+00:00,31,0.0667,0.0698,0.0667,0.138
2025-12-05T14:00:00+00:00,24,2025-12-04T14:00:00+00:00,95,0.0809,0.0979,-0.0806,0.2
2025-12-05T14:00:00+00:00,48,2025-12-03T14:00:00+00:00,191,0.1629,0.2385,0.1606,0.488
2025-12-05T14:00:00+00:00,72,2025-12-02T14:00:00+00:00,0,,,,`;

describe('Forecast Accuracy API', () => {
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

  test('GET returns parsed accuracy data', async () => {
    process.env.S3_FORECAST_ACCURACY_URL = 'https://test-bucket.s3.amazonaws.com/accuracy.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCSVData),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const data = JSON.parse(res._getData());
    
    expect(data.accuracy_data).toHaveLength(5);
    expect(data.evaluation_time).toBe('2025-12-05T14:00:00+00:00');
    
    // Check first row (2h horizon)
    expect(data.accuracy_data[0]).toMatchObject({
      horizon_hours: 2,
      predictions_compared: 7,
      mae: 0.0233,
      rmse: 0.0238,
      bias: 0.0233,
      max_error: 0.03,
    });
    
    // Check row with negative bias (24h horizon)
    expect(data.accuracy_data[2]).toMatchObject({
      horizon_hours: 24,
      bias: -0.0806,
    });
  });

  test('handles row with no data (null metrics)', async () => {
    process.env.S3_FORECAST_ACCURACY_URL = 'https://test-bucket.s3.amazonaws.com/accuracy.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCSVData),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const data = JSON.parse(res._getData());
    
    // 72h horizon has no data
    const row72h = data.accuracy_data.find(r => r.horizon_hours === 72);
    expect(row72h.mae).toBeNull();
    expect(row72h.rmse).toBeNull();
    expect(row72h.bias).toBeNull();
    expect(row72h.max_error).toBeNull();
  });

  test('GET returns 500 when S3_FORECAST_ACCURACY_URL not set', async () => {
    delete process.env.S3_FORECAST_ACCURACY_URL;

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Forecast accuracy URL not configured');
  });

  test('GET returns 502 when S3 fetch fails', async () => {
    process.env.S3_FORECAST_ACCURACY_URL = 'https://test-bucket.s3.amazonaws.com/accuracy.csv';
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(502);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Failed to fetch forecast accuracy data');
  });

  test('POST method not allowed', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  test('handles empty CSV gracefully', async () => {
    process.env.S3_FORECAST_ACCURACY_URL = 'https://test-bucket.s3.amazonaws.com/accuracy.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('evaluation_time,horizon_hours,forecast_made_at,predictions_compared,mae,rmse,bias,max_error'),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await forecastAccuracyHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.accuracy_data).toHaveLength(0);
    expect(data.evaluation_time).toBeNull();
  });
});
