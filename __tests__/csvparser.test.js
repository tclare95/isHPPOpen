import {
  parseCSV,
  parseForecastRow,
  parseAccuracyRow,
  parseCSVToForecast,
  parseCSVToAccuracy,
  parseForecastRowWithStability,
  parseCSVToForecastWithStability,
  parseCSVToStability,
} from '../libs/csvParser';

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    test('returns empty array for empty input', () => {
      expect(parseCSV('', (row) => row)).toEqual([]);
    });

    test('returns empty array for header-only CSV', () => {
      expect(parseCSV('header1,header2', (row) => row)).toEqual([]);
    });

    test('parses CSV and applies row parser', () => {
      const csv = 'col1,col2\nvalue1,value2\nvalue3,value4';
      const rowParser = (row) => {
        const [a, b] = row.split(',');
        return { a, b };
      };
      
      const result = parseCSV(csv, rowParser);
      expect(result).toEqual([
        { a: 'value1', b: 'value2' },
        { a: 'value3', b: 'value4' },
      ]);
    });

    test('filters out null values from row parser', () => {
      const csv = 'col1\nvalid\ninvalid\nvalid2';
      const rowParser = (row) => (row === 'invalid' ? null : { value: row });
      
      const result = parseCSV(csv, rowParser);
      expect(result).toEqual([
        { value: 'valid' },
        { value: 'valid2' },
      ]);
    });
  });

  describe('parseForecastRow', () => {
    test('parses valid forecast row', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42';
      const result = parseForecastRow(row);
      
      expect(result).toEqual({
        forecast_date: '2025-12-06T12:00:00Z',
        forecast_reading: 1.45,
        forecast_time: '2025-12-06T10:00:00Z',
        horizon_hours: 2,
        current_level: 1.42,
      });
    });

    test('returns null for invalid predicted level', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,invalid,1.42';
      const result = parseForecastRow(row);
      expect(result).toBeNull();
    });
  });

  describe('parseAccuracyRow', () => {
    test('parses valid accuracy row', () => {
      const row = '2025-12-06T10:00:00Z,6,2025-12-06T04:00:00Z,100,0.05,0.08,0.02,0.15';
      const result = parseAccuracyRow(row);
      
      expect(result).toEqual({
        evaluation_time: '2025-12-06T10:00:00Z',
        horizon_hours: 6,
        forecast_made_at: '2025-12-06T04:00:00Z',
        predictions_compared: 100,
        mae: 0.05,
        rmse: 0.08,
        bias: 0.02,
        max_error: 0.15,
      });
    });

    test('returns null for invalid horizon hours', () => {
      const row = '2025-12-06T10:00:00Z,invalid,2025-12-06T04:00:00Z,100,0.05,0.08,0.02,0.15';
      const result = parseAccuracyRow(row);
      expect(result).toBeNull();
    });

    test('handles null values for optional fields', () => {
      const row = '2025-12-06T10:00:00Z,6,2025-12-06T04:00:00Z,100,,,,';
      const result = parseAccuracyRow(row);
      
      expect(result.mae).toBeNull();
      expect(result.rmse).toBeNull();
      expect(result.bias).toBeNull();
      expect(result.max_error).toBeNull();
    });
  });

  describe('parseCSVToForecast', () => {
    test('parses full forecast CSV', () => {
      const csv = `forecast_time,target_time,horizon_hours,predicted_level,current_level
2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42
2025-12-06T10:00:00Z,2025-12-06T14:00:00Z,4,1.48,1.42`;
      
      const result = parseCSVToForecast(csv);
      
      expect(result).toHaveLength(2);
      expect(result[0].forecast_reading).toBe(1.45);
      expect(result[1].forecast_reading).toBe(1.48);
    });
  });

  describe('parseCSVToAccuracy', () => {
    test('parses full accuracy CSV', () => {
      const csv = `evaluation_time,horizon_hours,forecast_made_at,predictions_compared,mae,rmse,bias,max_error
2025-12-06T10:00:00Z,6,2025-12-06T04:00:00Z,100,0.05,0.08,0.02,0.15
2025-12-06T10:00:00Z,12,2025-12-05T22:00:00Z,100,0.08,0.12,0.03,0.20`;
      
      const result = parseCSVToAccuracy(csv);
      
      expect(result).toHaveLength(2);
      expect(result[0].horizon_hours).toBe(6);
      expect(result[1].horizon_hours).toBe(12);
    });
  });

  describe('parseForecastRowWithStability', () => {
    test('parses valid forecast row with stability', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42,0.025';
      const result = parseForecastRowWithStability(row);
      
      expect(result).toEqual({
        forecast_date: '2025-12-06T12:00:00Z',
        forecast_reading: 1.45,
        forecast_time: '2025-12-06T10:00:00Z',
        horizon_hours: 2,
        current_level: 1.42,
        stability_std: 0.025,
      });
    });

    test('handles missing stability_std column (old CSV format)', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42';
      const result = parseForecastRowWithStability(row);
      
      expect(result.stability_std).toBeNull();
      expect(result.forecast_reading).toBe(1.45);
    });

    test('handles empty stability_std', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42,';
      const result = parseForecastRowWithStability(row);
      
      expect(result.stability_std).toBeNull();
    });

    test('returns null for invalid predicted level', () => {
      const row = '2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,invalid,1.42,0.025';
      const result = parseForecastRowWithStability(row);
      expect(result).toBeNull();
    });
  });

  describe('parseCSVToForecastWithStability', () => {
    test('parses full forecast CSV with stability', () => {
      const csv = `forecast_time,target_time,horizon_hours,predicted_level,current_level,stability_std
2025-12-06T10:00:00Z,2025-12-06T12:00:00Z,2,1.45,1.42,0.015
2025-12-06T10:00:00Z,2025-12-06T14:00:00Z,4,1.48,1.42,0.025`;
      
      const result = parseCSVToForecastWithStability(csv);
      
      expect(result).toHaveLength(2);
      expect(result[0].stability_std).toBe(0.015);
      expect(result[1].stability_std).toBe(0.025);
    });
  });

  describe('parseCSVToStability', () => {
    test('parses full stability CSV using headers', () => {
      const csv = `target_time,forecast_current,forecast_1h_ago,forecast_2h_ago,forecast_3h_ago,forecast_4h_ago,forecast_5h_ago,forecast_6h_ago,forecast_7h_ago,forecast_8h_ago,forecast_9h_ago,forecast_10h_ago,forecast_11h_ago,forecast_12h_ago,stability_std,stability_range,revision_trend,rain_forecast_mm
2025-12-06T12:00:00Z,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,1.37,1.36,1.35,1.34,1.33,0.035,0.12,0.008,5.5
2025-12-06T14:00:00Z,1.50,1.49,1.48,1.47,1.46,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,0.040,0.12,-0.005,8.2`;
      
      const result = parseCSVToStability(csv);
      
      expect(result).toHaveLength(2);
      expect(result[0].forecast_current).toBe(1.45);
      expect(result[0].stability_std).toBe(0.035);
      expect(result[0].revision_trend).toBe(0.008);
      expect(result[0].rain_forecast_mm).toBe(5.5);
      expect(result[0].historical_forecasts[0]).toBe(1.44);
      expect(result[1].forecast_current).toBe(1.50);
      expect(result[1].revision_trend).toBe(-0.005);
      expect(result[1].rain_forecast_mm).toBe(8.2);
    });

    test('handles columns in different order', () => {
      const csv = `target_time,rain_forecast_mm,forecast_current,stability_std,forecast_1h_ago,forecast_2h_ago,forecast_3h_ago,forecast_4h_ago,forecast_5h_ago,forecast_6h_ago,forecast_7h_ago,forecast_8h_ago,forecast_9h_ago,forecast_10h_ago,forecast_11h_ago,forecast_12h_ago,stability_range,revision_trend
2025-12-06T12:00:00Z,12.5,1.45,0.035,1.44,1.43,1.42,1.41,1.40,1.39,1.38,1.37,1.36,1.35,1.34,1.33,0.12,0.008`;
      
      const result = parseCSVToStability(csv);
      
      expect(result).toHaveLength(1);
      expect(result[0].forecast_current).toBe(1.45);
      expect(result[0].rain_forecast_mm).toBe(12.5);
      expect(result[0].stability_std).toBe(0.035);
      expect(result[0].historical_forecasts[0]).toBe(1.44);
    });

    test('handles missing rain_forecast_mm column', () => {
      const csv = `target_time,forecast_current,forecast_1h_ago,forecast_2h_ago,forecast_3h_ago,forecast_4h_ago,forecast_5h_ago,forecast_6h_ago,forecast_7h_ago,forecast_8h_ago,forecast_9h_ago,forecast_10h_ago,forecast_11h_ago,forecast_12h_ago,stability_std,stability_range,revision_trend
2025-12-06T12:00:00Z,1.45,1.44,1.43,1.42,1.41,1.40,1.39,1.38,1.37,1.36,1.35,1.34,1.33,0.035,0.12,0.008`;
      
      const result = parseCSVToStability(csv);
      
      expect(result).toHaveLength(1);
      expect(result[0].forecast_current).toBe(1.45);
      expect(result[0].rain_forecast_mm).toBeNull();
    });
  });
});
