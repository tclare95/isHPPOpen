import { FORECAST_RANGE, FORECAST_RANGE_DESCRIPTION, FORECAST_RANGE_LABEL, rangeOffsets } from '../libs/forecastRange';

describe('indicative forecast range', () => {
  test('interpolates between published-error points and holds outside the table', () => {
    expect(rangeOffsets(0.25)).toEqual({ lower: -0.056, upper: 0.031 });
    expect(rangeOffsets(80)).toEqual({ lower: -0.147, upper: 0.063 });
    const mid = rangeOffsets(30); // halfway between 24 h and 36 h
    expect(mid.lower).toBeCloseTo((-0.092 - 0.114) / 2);
    expect(mid.upper).toBeCloseTo((0.053 + 0.06) / 2);
    expect(rangeOffsets(Number.NaN)).toBeNull();
  });

  test('every point brackets the forecast and the table is ordered by lead time', () => {
    FORECAST_RANGE.points.forEach((point, i) => {
      expect(point.lower).toBeLessThan(0);
      expect(point.upper).toBeGreaterThan(0);
      if (i > 0) expect(point.horizon_hours).toBeGreaterThan(FORECAST_RANGE.points[i - 1].horizon_hours);
    });
  });

  test('never claims to be a 95% confidence interval and states its limits', () => {
    expect(`${FORECAST_RANGE_LABEL} ${FORECAST_RANGE_DESCRIPTION}`).not.toMatch(/95|confidence interval/i);
    expect(FORECAST_RANGE_DESCRIPTION).toMatch(/rising quickly/);
    expect(FORECAST_RANGE_DESCRIPTION).toMatch(/flood/);
  });
});
