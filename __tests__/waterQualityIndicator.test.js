const { buildWaterQualityIndicator, getCsoActivityAssessment, getRunoffAssessment } = require('../libs/waterQualityIndicator');

const now = new Date('2026-08-31T12:00:00Z');
function density(value, count = 12) {
  return Array.from({ length: count }, (_, index) => ({ timestamp: new Date(now.getTime() - index * 15 * 60000).toISOString(), numberCSOsPerKm2: value })).reverse();
}

describe('waterQualityIndicator', () => {
  test('uses the newest three-hour window regardless of source ordering', () => {
    const rows = [{ timestamp: '2026-08-30T12:00:00Z', numberCSOsPerKm2: 0.1 }, ...density(0.005).reverse()];
    expect(getCsoActivityAssessment(rows, now)).toMatchObject({ level: 'lower', sampleCount: 12 });
  });

  test('applies calibrated CSO boundaries and minimum sample rule', () => {
    expect(getCsoActivityAssessment(density(0.0105), now).level).toBe('elevated');
    expect(getCsoActivityAssessment(density(0.03), now).level).toBe('high');
    expect(getCsoActivityAssessment(density(0.03, 7), now).level).toBe('unavailable');
  });

  test('calculates four-hour river rise with irregular readings', () => {
    const result = getRunoffAssessment([
      { reading_date: '2026-08-31T07:40:00Z', reading_level: 1.0 },
      { reading_date: '2026-08-31T08:10:00Z', reading_level: 1.1 },
      { reading_date: '2026-08-31T11:55:00Z', reading_level: 1.42 },
    ], now);
    expect(result.level).toBe('high');
    expect(result.riseMetres).toBeCloseTo(0.42);
  });

  test('combines the worse factor and reports partial or unavailable input', () => {
    const high = buildWaterQualityIndicator({ csoData: density(0.03), levelData: [{ reading_date: '2026-08-31T11:55:00Z', reading_level: 1.2 }], now });
    expect(high).toMatchObject({ level: 'high', partial: true });
    const unavailable = buildWaterQualityIndicator({ csoData: [], levelData: [], now });
    expect(unavailable.level).toBe('unavailable');
  });
  test('never shows Lower from a calm river when CSO activity data is missing or stale', () => {
    const calmRiver = [{ reading_date: '2026-08-31T08:00:00Z', reading_level: 1.0 }, { reading_date: '2026-08-31T11:55:00Z', reading_level: 1.0 }];
    const risingRiver = [{ reading_date: '2026-08-31T08:00:00Z', reading_level: 1.0 }, { reading_date: '2026-08-31T11:55:00Z', reading_level: 1.5 }];
    const staleCso = density(0.001).map((row) => ({ ...row, timestamp: new Date(new Date(row.timestamp).getTime() - 2 * 3600000).toISOString() }));

    for (const csoData of [[], staleCso]) {
      expect(buildWaterQualityIndicator({ csoData, levelData: calmRiver, now })).toMatchObject({ level: 'unavailable', partial: false, atLeast: false });
      // A rising river can still raise the indication, but only as "at least" that level.
      expect(buildWaterQualityIndicator({ csoData, levelData: risingRiver, now })).toMatchObject({ level: 'high', partial: true, atLeast: true });
    }
    expect(buildWaterQualityIndicator({ csoData: density(0.001), levelData: calmRiver, now })).toMatchObject({ level: 'lower', partial: false, atLeast: false });
  });
});
