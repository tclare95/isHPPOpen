const { createMocks } = require('node-mocks-http');
const s3forecastHandler = require('../../pages/api/s3forecast').default;

// Sample CSV data matching the format from S3
const mockCSVData = `forecast_time,target_time,horizon_hours,predicted_level,current_level
2025-12-02T13:00:00+00:00,2025-12-02T13:15:00+00:00,0.25,1.562,2.58
2025-12-02T13:00:00+00:00,2025-12-02T13:30:00+00:00,0.5,1.563,2.58
2025-12-02T13:00:00+00:00,2025-12-02T13:45:00+00:00,0.75,1.563,2.58
2025-12-02T13:00:00+00:00,2025-12-02T14:00:00+00:00,1.0,1.563,2.58`;

describe('S3 Forecast API', () => {
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

  test('GET returns parsed forecast data', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCSVData),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    
    const data = JSON.parse(res._getData());
    
    expect(data.forecast_data).toHaveLength(4);
    expect(data.forecast_data[0]).toMatchObject({
      forecast_date: '2025-12-02T13:15:00+00:00',
      forecast_reading: 1.562,
    });
    expect(data.metadata).toMatchObject({
      forecast_time: '2025-12-02T13:00:00+00:00',
      current_level: 2.58,
    });
  });

  test('GET returns 500 when S3_FORECAST_URL not set', async () => {
    delete process.env.S3_FORECAST_URL;

    const { req, res } = createMocks({
      method: 'GET',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Forecast URL not configured');
  });

  test('GET returns 502 when S3 fetch fails', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(502);
    const data = JSON.parse(res._getData());
    expect(data.message).toBe('Failed to fetch forecast data');
  });

  test('POST method not allowed', async () => {
    const { req, res } = createMocks({
      method: 'POST',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  test('handles empty CSV gracefully', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('forecast_time,target_time,horizon_hours,predicted_level,current_level'),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.forecast_data).toHaveLength(0);
    expect(data.metadata).toBeNull();
  });

  test('filters out invalid rows', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    const csvWithInvalidRow = `forecast_time,target_time,horizon_hours,predicted_level,current_level
2025-12-02T13:00:00+00:00,2025-12-02T13:15:00+00:00,0.25,1.562,2.58
invalid,row,data,not_a_number,here
2025-12-02T13:00:00+00:00,2025-12-02T13:30:00+00:00,0.5,1.563,2.58`;

    global.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csvWithInvalidRow),
    });

    const { req, res } = createMocks({
      method: 'GET',
    });

    await s3forecastHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.forecast_data).toHaveLength(2); // Invalid row filtered out
  });
});
