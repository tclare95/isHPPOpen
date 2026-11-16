import {
  activityLevel, alertRisk, ASSESSMENT_METHOD, assessRiverConditions, assessUpstreamActivity, buildAssessment, combineAssessment, outfallEvidenceAt,
} from '../libs/waterQualityAssessment';
import { assetId, item, realCapture, setRead } from '../testUtils/rdpWaterQualityFixtures';

const HOUR = 3600000;
const now = new Date('2026-11-16T18:00:00Z');
const at = now.getTime();
const readFrom = new Date(at - 168 * HOUR).toISOString();
const readAt = at;
const ago = (hours) => new Date(at - hours * HOUR).toISOString();

function evaluate(items, { live = true } = {}) {
  return assessUpstreamActivity({ memberIds: items.map((entry) => entry.status.assetId), items: new Map(items.map((entry) => [entry.status.assetId, entry])),
    at, readFrom, readAt, live });
}
const quiet = (count, prefix = 'Q') => Array.from({ length: count }, (_, index) => item(`${prefix}${index}`));
const recent = (count, prefix = 'R', hoursAgo = 10) => Array.from({ length: count }, (_, index) => item(`${prefix}${index}`,
  { events: [{ startedAt: ago(hoursAgo + 1), endedAt: ago(hoursAgo), lifecycle: 'completed' }] }));
const spilling = (count, prefix = 'S') => Array.from({ length: count }, (_, index) => item(`${prefix}${index}`,
  { state: 'spilling', events: [{ startedAt: ago(1), lifecycle: 'ongoing' }] }));

describe('activity bands (explicit v1 product defaults)', () => {
  test.each([
    [0, 0, 'lower'], [2, 14, 'lower'], [3, 0, 'elevated'], [0, 15, 'elevated'], [9, 59, 'elevated'], [10, 0, 'high'], [0, 60, 'high'],
  ])('%i spilling now and %i in 48 h is %s', (now_, recent_, level) => expect(activityLevel(now_, recent_)).toBe(level));

  test('the method is versioned and records every threshold', () => {
    expect(ASSESSMENT_METHOD).toMatchObject({ version: 'hpp-upstream-activity/v1', recentHours: 48,
      bands: { elevated: { spillingNow: 3, recent: 15 }, high: { spillingNow: 10, recent: 60 } }, maxUnknownShareForLower: 0.05 });
    expect(Object.isFrozen(ASSESSMENT_METHOD.bands.high)).toBe(true);
  });
});

describe('one outfall at one instant', () => {
  const options = { readFrom, readAt, live: false };
  test('a spill that ended inside the window is recent; one that ended before it is not', () => {
    expect(outfallEvidenceAt(item('A', { events: [{ startedAt: ago(50), endedAt: ago(47), lifecycle: 'completed' }] }), at, options)).toMatchObject({ recent: 'yes', spilling: 'no' });
    expect(outfallEvidenceAt(item('A', { events: [{ startedAt: ago(52), endedAt: ago(49), lifecycle: 'completed' }] }), at, options)).toMatchObject({ recent: 'no', reason: 'no_recent_spill' });
  });

  test('a spill without a reported end counts only when it certainly overlaps the window', () => {
    const started = (hours, endNoLaterThan) => item('A', { events: [{ startedAt: ago(hours), endNoLaterThan, lifecycle: 'unresolved' }] });
    expect(outfallEvidenceAt(started(5, null), at, options)).toMatchObject({ recent: 'yes', spilling: 'unknown' });
    expect(outfallEvidenceAt(started(60, ago(30)), at, options)).toMatchObject({ recent: 'unknown', reason: 'event_end_unknown' });
    expect(outfallEvidenceAt(started(60, ago(55)), at, options)).toMatchObject({ recent: 'no' });
  });

  test('a later spill is not seen from an earlier instant', () => {
    const later = item('A', { events: [{ startedAt: ago(1), endedAt: ago(0.5), lifecycle: 'completed' }] });
    expect(outfallEvidenceAt(later, at - 2 * HOUR, options)).toMatchObject({ recent: 'no' });
  });

  test('"no spill" needs collection throughout the window', () => {
    expect(outfallEvidenceAt(item('A', { gaps: [[ago(30), ago(20)]] }), at, options)).toMatchObject({ recent: 'unknown', reason: 'not_collected' });
    expect(outfallEvidenceAt(item('A', { gaps: [[ago(80), ago(60)]] }), at, options)).toMatchObject({ recent: 'no' });
    expect(outfallEvidenceAt(item('A', { coverageStatus: 'unknown' }), at, options)).toMatchObject({ recent: 'unknown', reason: 'coverage_unknown' });
    // A trailing gap younger than one collection tolerance is the next poll not having run yet.
    expect(outfallEvidenceAt(item('A', { gaps: [[ago(0.5), ago(0)]] }), at, options)).toMatchObject({ recent: 'no' });
    // The read must reach back over the whole window.
    expect(outfallEvidenceAt(item('A'), at, { ...options, readFrom: ago(24) })).toMatchObject({ recent: 'unknown', reason: 'outside_read_window' });
  });

  test('the live point also needs a fresh, online, agreeing status', () => {
    const live = { ...options, live: true };
    expect(outfallEvidenceAt(item('A', { state: 'offline' }), at, live)).toMatchObject({ recent: 'unknown', reason: 'offline' });
    expect(outfallEvidenceAt(item('A', { state: 'stale' }), at, live)).toMatchObject({ recent: 'unknown', reason: 'stale' });
    expect(outfallEvidenceAt(item('A', { state: 'unavailable' }), at, live)).toMatchObject({ recent: 'unknown' });
    expect(outfallEvidenceAt(item('A', { noEvents: true }), at, live)).toMatchObject({ recent: 'unknown', reason: 'events_unavailable' });
    expect(outfallEvidenceAt(item('A', { truncated: true }), at, live)).toMatchObject({ recent: 'unknown', reason: 'events_truncated' });
    expect(outfallEvidenceAt(item('A', { state: 'spilling' }), at, live)).toMatchObject({ recent: 'yes', spilling: 'yes' });
    expect(outfallEvidenceAt(undefined, at, live)).toMatchObject({ recent: 'unknown', reason: 'not_read' });
  });
});

describe('upstream activity over the membership', () => {
  test('counts recorded spills and reports bounds', () => {
    const result = evaluate([...recent(16), ...spilling(1), ...quiet(83)]);
    expect(result).toMatchObject({ level: 'elevated', atLeast: false, partial: false, recent: { min: 17, max: 17 }, spillingNow: { min: 1, max: 1 }, unknown: 0 });
    expect(result.reason).toMatch(/^17 of 100 reviewed upstream storm overflows spilled in the last 48 hours; 1 was spilling/);
  });

  test('missing evidence is never counted as no spill: Lower needs nearly complete evidence', () => {
    // 4 unknown of 100 could lift 12 recorded spills over the Elevated line, but 4% is within the 5% tolerance.
    expect(evaluate([...recent(12), ...quiet(84), ...Array.from({ length: 4 }, (_, index) => item(`O${index}`, { state: 'offline' }))]))
      .toMatchObject({ level: 'lower', partial: true, possibleLevels: ['lower', 'elevated'] });
    // 10% unknown: Lower cannot be shown.
    const tooMany = evaluate([...recent(12), ...quiet(78), ...Array.from({ length: 10 }, (_, index) => item(`O${index}`, { state: 'offline' }))]);
    expect(tooMany).toMatchObject({ level: 'unavailable', unavailableReason: 'insufficient_evidence', possibleLevels: ['lower', 'high'] });
    // Fully determined despite unknowns: still Lower, flagged partial.
    expect(evaluate([...quiet(88), ...Array.from({ length: 2 }, (_, index) => item(`O${index}`, { state: 'offline' }))]))
      .toMatchObject({ level: 'lower', partial: true, possibleLevels: ['lower', 'lower'] });
  });

  test('recorded activity is shown as "at least" when unknowns could raise it', () => {
    const result = evaluate([...recent(20), ...quiet(30), ...Array.from({ length: 50 }, (_, index) => item(`O${index}`, { state: 'offline' }))]);
    expect(result).toMatchObject({ level: 'elevated', atLeast: true, possibleLevels: ['elevated', 'high'] });
  });

  test('no membership or no instant is unavailable', () => {
    expect(assessUpstreamActivity({ memberIds: [], items: new Map(), at, readFrom, readAt })).toMatchObject({ level: 'unavailable', unavailableReason: 'no_evidence' });
  });
});

describe('river conditions', () => {
  // A regulated daily sawtooth of 0.15 m with a constant base: never a rise.
  const sawtooth = (base, hours = 30) => Array.from({ length: hours * 4 + 1 }, (_, index) => {
    const time = at - index * 15 * 60000;
    const hour = new Date(time).getUTCHours();
    return { reading_date: new Date(time).toISOString(), reading_level: base(index) + (hour >= 7 && hour < 10 ? 0.15 : 0) };
  });

  test('a regulated daily cycle is not runoff', () => {
    expect(assessRiverConditions(sawtooth(() => 1.0), at)).toMatchObject({ level: 'lower' });
  });

  test('applies the 24-hour rise bands', () => {
    const rising = (metres) => sawtooth((index) => 1.0 + (index < 24 ? metres : 0));
    expect(assessRiverConditions(rising(0.12), at)).toMatchObject({ level: 'elevated', riseMetres: 0.12 });
    expect(assessRiverConditions(rising(0.35), at)).toMatchObject({ level: 'high' });
    expect(assessRiverConditions(rising(0.12), at).reason).toMatch(/0\.12 m higher than at the same time yesterday/);
  });

  test('stale or sparse levels are unavailable', () => {
    expect(assessRiverConditions(sawtooth(() => 1.0), at + 2 * HOUR)).toMatchObject({ level: 'unavailable' });
    expect(assessRiverConditions(sawtooth(() => 1.0, 10), at)).toMatchObject({ level: 'unavailable' });
    expect(assessRiverConditions([], at)).toMatchObject({ level: 'unavailable' });
  });
});

describe('combining factors', () => {
  const cso = (level, extra = {}) => ({ level, reason: `cso ${level}`, ...extra });
  const runoff = (level) => ({ level, reason: `runoff ${level}` });
  test('the higher factor wins', () => {
    expect(combineAssessment(cso('elevated'), runoff('lower'))).toMatchObject({ level: 'elevated', partial: false });
    expect(combineAssessment(cso('lower'), runoff('high'))).toMatchObject({ level: 'high', atLeast: false });
  });
  test('river conditions can raise an indication but never stand in for missing overflow evidence', () => {
    expect(combineAssessment(cso('unavailable'), runoff('lower'))).toMatchObject({ level: 'unavailable' });
    expect(combineAssessment(cso('unavailable'), runoff('elevated'))).toMatchObject({ level: 'elevated', atLeast: true, partial: true });
    expect(combineAssessment(cso('lower'), runoff('unavailable'))).toMatchObject({ level: 'lower', partial: true });
  });
});

describe('alert view', () => {
  test('maps proven and possible levels to risk colours', () => {
    expect(alertRisk({ level: 'elevated', possibleLevels: ['elevated', 'high'], observedAt: 'T' })).toEqual({ lowest: 'amber', highest: 'red', at: 'T' });
    expect(alertRisk({ level: 'unavailable' })).toBeNull();
  });
});

describe('current point and history', () => {
  const items = [...recent(20), ...quiet(80)];
  const read = setRead(items, { from: readFrom, retrievedAt: now.toISOString() });
  const memberIds = items.map((entry) => entry.status.assetId);

  test('a stale or missing set read never describes "now"', () => {
    const stale = buildAssessment({ memberIds, read, now: new Date(at + 31 * 60000) });
    expect(stale.current.factors.cso).toMatchObject({ level: 'unavailable', unavailableReason: 'stale_evidence' });
    expect(stale.current.level).toBe('unavailable');
    expect(buildAssessment({ memberIds, read: null, now }).current.factors.cso.unavailableReason).toBe('no_evidence');
  });

  test('history is hourly, ends at the read and never starts before a whole window is covered', () => {
    const { history } = buildAssessment({ memberIds, read, now, hours: 120 });
    expect(history.points).toHaveLength(121);
    expect(history.points.at(-1).at).toBe(now.toISOString());
    expect(history.points[0].at).toBe(ago(120));
    const short = buildAssessment({ memberIds, read: { ...read, from: ago(60) }, now, hours: 120 });
    expect(short.history.points[0].at).toBe(ago(12));
  });
});

describe('representative real data (public capture, 2026-11-16)', () => {
  const capture = realCapture();
  const result = buildAssessment({ memberIds: capture.memberIds, read: capture.read, levelData: capture.levelData, now: capture.retrievedAt, hours: 120 });
  const point = (iso) => result.history.points.find((entry) => entry.at === iso);

  test('current: 32 of 592 spilled after the 15 November rain, Elevated; offline monitors are reported, not treated as clear', () => {
    expect(result.current).toMatchObject({ version: 'hpp-upstream-activity/v1', level: 'elevated', partial: true, atLeast: false });
    expect(result.current.factors.cso).toMatchObject({ members: 592, recent: { min: 32, max: 36 }, spillingNow: { min: 0 }, unknown: 4,
      unknownReasons: { offline: 3, events_truncated: 1 } });
    expect(result.current.factors.runoff).toMatchObject({ level: 'elevated', riseMetres: expect.closeTo(0.159, 2) });
  });

  test('before RDP collection covered a whole 48 h window the assessment is unavailable, not Lower', () => {
    expect(point('2026-11-13T12:00:00.000Z')).toMatchObject({ csoLevel: 'unavailable' });
    expect(point('2026-11-13T12:00:00.000Z').unknown).toBeGreaterThan(580);
  });

  test('dry days are Lower and the rain event raises it within hours', () => {
    expect(point('2026-11-15T10:00:00.000Z')).toMatchObject({ csoLevel: 'lower', level: 'lower' });
    expect(point('2026-11-15T16:00:00.000Z')).toMatchObject({ csoLevel: 'elevated', recent: { min: 24 } });
    expect(point('2026-11-15T10:00:00.000Z').riseMetres).toBeLessThan(0.05);
  });

  test('the legacy density moved with the same event but is a different scale (never compared numerically)', () => {
    const legacy = (iso) => capture.legacyDensity.find((row) => row.timestamp.startsWith(iso)).numberCSOsPerKm2;
    expect(legacy('2026-11-15T10')).toBeLessThan(0.001);
    expect(legacy('2026-11-16T10')).toBeGreaterThan(0.008);
    expect(result.current.factors.cso).not.toHaveProperty('numberCSOsPerKm2');
  });

  test('uses canonical RDP asset IDs', () => {
    expect(capture.memberIds[0]).toBe(assetId(capture.memberIds[0].split(':').at(-1)));
  });
});
