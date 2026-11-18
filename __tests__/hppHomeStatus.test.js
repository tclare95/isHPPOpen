import { HPP_RULE_V1, isOpenAtLevel } from '../libs/hpp/hppDecision';
import {
  HPP_THRESHOLD_METRES,
  formatReadingAge,
  getLatestLevelReading,
  getLevelFreshness,
  getRecordedHppStatus,
  isClosedForEventOn,
  readingDisagreesWithStatus,
} from '../libs/hpp/hppHomeStatus';

const NOW = new Date('2026-11-17T12:00:00Z');
const minutesAgo = (minutes) => new Date(NOW.getTime() - minutes * 60000).toISOString();
const levels = (reading_level, reading_date = minutesAgo(10), health) => ({
  level_data: [{ reading_level, reading_date }],
  ...(health ? { health } : {}),
});

describe('homepage HPP status helpers', () => {
  test('use the HPP service threshold: open strictly below 2.2 m, closed at 2.2 m', () => {
    expect(HPP_THRESHOLD_METRES).toBe(HPP_RULE_V1.closedAtOrAboveMetres);
    const fresh = (level) => getLatestLevelReading(levels(level));

    // At exactly 2.2 m the service records closed, so an "open" status disagrees and "closed" agrees.
    expect(readingDisagreesWithStatus('open', fresh(2.2), 'fresh')).toBe(true);
    expect(readingDisagreesWithStatus('closed', fresh(2.2), 'fresh')).toBe(false);
    expect(readingDisagreesWithStatus('open', fresh(2.199), 'fresh')).toBe(false);
    expect(readingDisagreesWithStatus('closed', fresh(2.199), 'fresh')).toBe(true);
    for (const level of [2.199, 2.2, 2.201]) {
      expect(readingDisagreesWithStatus('open', fresh(level), 'fresh')).toBe(!isOpenAtLevel(level));
    }
  });

  test('stale, missing or unknown evidence never disagrees with the recorded status', () => {
    const reading = getLatestLevelReading(levels(2.5));
    expect(readingDisagreesWithStatus('open', reading, 'stale')).toBe(false);
    expect(readingDisagreesWithStatus('open', null, 'unavailable')).toBe(false);
    expect(readingDisagreesWithStatus('unknown', reading, 'fresh')).toBe(false);
  });

  test('a missing, non-numeric or undated reading is not a reading', () => {
    expect(getLatestLevelReading(undefined)).toBeNull();
    expect(getLatestLevelReading({ level_data: [] })).toBeNull();
    expect(getLatestLevelReading(levels(null))).toBeNull();
    expect(getLatestLevelReading(levels('1.2'))).toBeNull();
    expect(getLatestLevelReading(levels(Number.NaN))).toBeNull();
    expect(getLatestLevelReading(levels(1.2, null))).toBeNull();
    expect(getLatestLevelReading(levels(1.2, 'not a date'))).toBeNull();
    expect(getLatestLevelReading(levels(0, minutesAgo(5)))).toEqual({ level: 0, observedAt: new Date(minutesAgo(5)) });
  });

  test('freshness follows the 30-minute observation age and the route health', () => {
    const reading = (minutes) => getLatestLevelReading(levels(1.4, minutesAgo(minutes)));
    expect(getLevelFreshness(levels(1.4), reading(30), NOW)).toBe('fresh');
    expect(getLevelFreshness(levels(1.4), reading(31), NOW)).toBe('stale');
    expect(getLevelFreshness(levels(1.4, minutesAgo(5), { state: 'stale' }), reading(5), NOW)).toBe('stale');
    expect(getLevelFreshness({ level_data: [] }, null, NOW)).toBe('unavailable');
    // A cached "fresh" response whose observation has since aged is stale at display time.
    const cached = levels(1.4, minutesAgo(45), { state: 'fresh', generatedAt: minutesAgo(45) });
    expect(getLevelFreshness(cached, reading(45), NOW)).toBe('stale');
  });

  test('reading age is described in minutes, hours or days', () => {
    expect(formatReadingAge(new Date(minutesAgo(1)), NOW)).toBe('1 minute');
    expect(formatReadingAge(new Date(minutesAgo(59)), NOW)).toBe('59 minutes');
    expect(formatReadingAge(new Date(minutesAgo(60)), NOW)).toBe('1 hour');
    expect(formatReadingAge(new Date(minutesAgo(60 * 50)), NOW)).toBe('2 days');
  });

  test('the recorded status comes only from the status payload', () => {
    expect(getRecordedHppStatus({ isEmpty: false, currentStatus: true, health: { state: 'fresh' } })).toBe('open');
    expect(getRecordedHppStatus({ isEmpty: false, currentStatus: false, health: { state: 'fresh' } })).toBe('closed');
    expect(getRecordedHppStatus({ isEmpty: true, currentStatus: null, health: { state: 'fresh' } })).toBe('unknown');
    expect(getRecordedHppStatus({ isEmpty: true, currentStatus: null, health: { state: 'unavailable' } })).toBe('unavailable');
    expect(getRecordedHppStatus({ isEmpty: false })).toBe('unknown');
  });

  test('events restrict whole days inclusively and unreadable dates are ignored', () => {
    const day = (offset) => new Date(NOW.getTime() + offset * 86400000).toISOString();
    expect(isClosedForEventOn([{ event_start_date: day(-1), event_end_date: day(1) }], NOW)).toBe(true);
    expect(isClosedForEventOn([{ event_start_date: day(0), event_end_date: day(0) }], NOW)).toBe(true);
    expect(isClosedForEventOn([{ event_start_date: day(1), event_end_date: day(2) }], NOW)).toBe(false);
    expect(isClosedForEventOn([{ event_start_date: day(-3), event_end_date: day(-2) }], NOW)).toBe(false);
    expect(isClosedForEventOn([{ event_start_date: null, event_end_date: day(1) }], NOW)).toBe(false);
    expect(isClosedForEventOn([{ event_start_date: day(-1), event_end_date: null }], NOW)).toBe(false);
    expect(isClosedForEventOn(undefined, NOW)).toBe(false);
  });
});
