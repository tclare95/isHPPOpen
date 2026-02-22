const { GET } = require('../../app/api/s3forecast/route');

// Sample CSV data matching the format from S3 (with stability_std column)
const mockCSVData = `forecast_time,target_time,horizon_hours,predicted_level,current_level,stability_std
2025-12-02T13:00:00+00:00,2025-12-02T13:15:00+00:00,0.25,1.562,2.58,0.015
2025-12-02T13:00:00+00:00,2025-12-02T13:30:00+00:00,0.5,1.563,2.58,0.018
2025-12-02T13:00:00+00:00,2025-12-02T13:45:00+00:00,0.75,1.563,2.58,
2025-12-02T13:00:00+00:00,2025-12-02T14:00:00+00:00,1.0,1.563,2.58,0.025`;

describe('S3 Forecast API route handler', () => {
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

  test('GET returns parsed forecast data', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCSVData),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    const data = payload.data;
    
    expect(data.forecast_data).toHaveLength(4);
    expect(data.forecast_data[0]).toMatchObject({
      forecast_date: '2025-12-02T13:15:00+00:00',
      forecast_reading: 1.562,
      stability_std: 0.015,
    });
    expect(data.forecast_data[2].stability_std).toBeNull(); // Empty stability
    expect(data.metadata).toMatchObject({
      forecast_time: '2025-12-02T13:00:00+00:00',
      current_level: 2.58,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://test-bucket.s3.amazonaws.com/forecast.csv',
      { next: { revalidate: 900 } }
    );
  });

  test('GET returns 500 when S3_FORECAST_URL not set', async () => {
    delete process.env.S3_FORECAST_URL;

    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.message).toBe('Forecast URL not configured');
  });

  test('GET returns 502 when S3 fetch fails', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await GET();
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error.message).toBe('Failed to fetch forecast data');
  });

  test('handles empty CSV gracefully', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('forecast_time,target_time,horizon_hours,predicted_level,current_level,stability_std'),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    const data = payload.data;
    expect(data.forecast_data).toHaveLength(0);
    expect(data.metadata).toBeNull();
  });

  test('filters out invalid rows', async () => {
    process.env.S3_FORECAST_URL = 'https://test-bucket.s3.amazonaws.com/forecast.csv';
    
    const csvWithInvalidRow = `forecast_time,target_time,horizon_hours,predicted_level,current_level,stability_std
2025-12-02T13:00:00+00:00,2025-12-02T13:15:00+00:00,0.25,1.562,2.58,0.01
invalid,row,data,not_a_number,here,bad
2025-12-02T13:00:00+00:00,2025-12-02T13:30:00+00:00,0.5,1.563,2.58,0.02`;

    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(csvWithInvalidRow),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    const data = payload.data;
    expect(data.forecast_data).toHaveLength(2); // Invalid row filtered out
  });
});
