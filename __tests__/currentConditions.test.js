import { act, render, screen, within } from '@testing-library/react';
import CurrentConditions from '../components/layout/frontpage/currentConditions';
import useFetch from '../libs/useFetch';
import {
  describeNearbyGauges,
  describeNextDayForecast,
  describeTrend,
  formatTrend,
  levelSeriesFrom,
} from '../libs/currentConditions';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href, className }) => <a href={href} className={className}>{children}</a>);

const NOW = new Date('2026-11-18T12:00:00Z');
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60000).toISOString();

// Newest first, every 15 minutes, starting `startMinutesAgo` back from now.
function levelRows(values, startMinutesAgo = 10) {
  return values.map((value, index) => ({ reading_date: at(startMinutesAgo + index * 15), reading_level: value }));
}

function gaugeReadings(values, startMinutesAgo = 10) {
  return values.map((value, index) => ({ dateTime: at(startMinutesAgo + index * 15), value }));
}

// 9 readings = 2 hours of 15-minute readings.
const RISING = [1.5, 1.49, 1.48, 1.47, 1.46, 1.45, 1.44, 1.43, 1.42];
const STEADY = [1.3, 1.3, 1.3, 1.3, 1.31, 1.3, 1.3, 1.3, 1.3];

function forecastPayload({ madeMinutesAgo = 20, values = [1.5, 1.6, 1.7], stepHours = 6 } = {}) {
  return {
    forecast_data: values.map((value, index) => ({
      forecast_date: new Date(NOW.getTime() + (index + 1) * stepHours * 3600000).toISOString(),
      forecast_reading: value,
      forecast_time: at(madeMinutesAgo),
      horizon_hours: (index + 1) * stepHours,
    })),
    metadata: { forecast_time: at(madeMinutesAgo) },
  };
}

const ACCURACY = { accuracy_data: [{ horizon_hours: 6, mae: 0.05 }, { horizon_hours: 24, mae: 0.1 }] };

const ok = (data) => ({ data, error: undefined, isPending: false });
const failed = () => ({ data: undefined, error: new Error('failed'), isPending: false });
const pending = () => ({ data: undefined, error: undefined, isPending: true });

function trentPayload(overrides = {}) {
  return {
    stations: [
      { stationId: 4126, measures: { level: { readings: gaugeReadings(RISING) } } },
      { stationId: 4007, measures: { level: { readings: gaugeReadings(STEADY) }, flow: { readings: gaugeReadings([85.2]) } } },
      { stationId: 4067, measures: { level: { readings: gaugeReadings([0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]) } } },
      { stationId: 4074, measures: { level: { readings: gaugeReadings([3.4], 200) } } },
      ...(overrides.extraStations ?? []),
    ],
  };
}

const ALL_FRESH = {
  '/api/hppstatus': ok({ currentStatus: true, lastChangedAt: '2026-03-15T19:52:22Z', health: { state: 'fresh' } }),
  '/api/levels': ok({ level_data: levelRows(RISING) }),
  '/api/s3forecast': ok(forecastPayload()),
  '/api/forecastaccuracy': ok(ACCURACY),
  '/api/trentweirs': ok(trentPayload()),
};

function mockResponses(responses) {
  useFetch.mockImplementation((path) => (path && path in responses ? responses[path] : { data: undefined, error: undefined, isPending: false }));
}

async function renderSummary(responses, props = {}) {
  mockResponses({ ...ALL_FRESH, ...responses });
  const result = render(<CurrentConditions {...props} />);
  // The clock is sampled after mount.
  await act(async () => { jest.advanceTimersByTime(1); });
  return result;
}

const tile = (name) => screen.getByRole('article', { name });

describe('current-conditions logic', () => {
  it('derives rising, falling and steady movement from a complete two-hour window', () => {
    expect(describeTrend(levelSeriesFrom({ level_data: levelRows(RISING) }))).toMatchObject({ state: 'rising' });
    expect(formatTrend(describeTrend(levelSeriesFrom({ level_data: levelRows(RISING) })))).toBe('Rising 8 cm over 2 hours');
    expect(describeTrend(levelSeriesFrom({ level_data: levelRows([...RISING].reverse()) }))).toMatchObject({ state: 'falling' });
    expect(describeTrend(levelSeriesFrom({ level_data: levelRows(STEADY) }))).toMatchObject({ state: 'steady' });
  });

  it('says the trend is unknown, never steady, when readings are incomplete', () => {
    // Only 45 minutes of readings.
    expect(describeTrend(levelSeriesFrom({ level_data: levelRows([1.5, 1.4, 1.3, 1.2]) }))).toEqual({ state: 'unknown', reason: 'incomplete' });
    // A 90-minute gap inside the window.
    const gapped = [
      { reading_date: at(10), reading_level: 1.5 },
      { reading_date: at(100), reading_level: 1.5 },
      { reading_date: at(130), reading_level: 1.5 },
    ];
    expect(describeTrend(levelSeriesFrom({ level_data: gapped }))).toEqual({ state: 'unknown', reason: 'incomplete' });
    // A single reading, and no readings.
    expect(describeTrend(levelSeriesFrom({ level_data: levelRows([1.5]) })).state).toBe('unknown');
    expect(describeTrend(levelSeriesFrom({ level_data: [] }))).toEqual({ state: 'unknown', reason: 'no-readings' });
    // Non-numeric readings are dropped, not read as 0 m.
    const corrupt = levelRows(RISING).map((row, index) => (index > 2 ? { ...row, reading_level: null } : row));
    expect(describeTrend(levelSeriesFrom({ level_data: corrupt })).state).toBe('unknown');
    expect(formatTrend({ state: 'unknown', reason: 'incomplete' })).toMatch(/unknown: recent readings are incomplete/);
  });

  it('keeps every gauge in its own units and never substitutes another gauge', () => {
    const gauges = describeNearbyGauges({ stations: [{ stationId: 4007, measures: { flow: { readings: gaugeReadings([85.2]) } } }] });
    expect(gauges.map((gauge) => gauge.name)).toEqual(['Clifton Bridge', 'Shardlow', 'Church Wilne', 'Kegworth', 'Shardlow (Flow)']);
    expect(gauges.find((gauge) => gauge.name === 'Shardlow')).toMatchObject({ unit: 'm', latest: null });
    expect(gauges.find((gauge) => gauge.name === 'Shardlow (Flow)')).toMatchObject({ unit: 'm³/s', reference: 'flow' });
    expect(gauges.find((gauge) => gauge.name === 'Shardlow (Flow)').latest.value).toBe(85.2);
    expect(gauges.find((gauge) => gauge.name === 'Clifton Bridge')).toMatchObject({ reference: "above this gauge's own datum", latest: null });
    // Colwick is shown from /api/levels, not repeated as a nearby gauge.
    expect(gauges.some((gauge) => gauge.name === 'Colwick')).toBe(false);
  });

  it('summarises only the next 24 hours of forecast with its indicative range', () => {
    const forecast = describeNextDayForecast(forecastPayload({ values: [1.5, 1.6, 1.7, 2.1, 2.6], stepHours: 6 }), ACCURACY.accuracy_data, NOW);
    expect(forecast).toMatchObject({ state: 'available', direction: 'rise', guide: 'range-reaches', notice: null });
    // 2.1 m is 24 h away (inside, and its range reaches 2.2 m); 2.6 m at 30 h is outside the coming day.
    expect(forecast.peak.value).toBe(2.1);
    expect(forecast.peak.rangeLow).toBeLessThan(2.1);
    expect(forecast.peak.rangeHigh).toBeGreaterThan(2.2);
    expect(describeNextDayForecast(forecastPayload(), [], NOW).peak).toMatchObject({ rangeLow: null, rangeHigh: null });
    expect(describeNextDayForecast(undefined, undefined, NOW).state).toBe('unavailable');
    expect(describeNextDayForecast(forecastPayload({ values: [1.5], stepHours: 30 }), [], NOW).state).toBe('no-coverage');
  });

  it('identifies a predicted crossing as predicted conditions, not a status', () => {
    expect(describeNextDayForecast(forecastPayload({ values: [2.0, 2.3] }), [], NOW).guide).toBe('predicted-at-or-above');
    expect(describeNextDayForecast(forecastPayload({ values: [2.4, 2.1] }), [], NOW, { recordedStatus: 'closed' }).guide).toBe('predicted-below');
    expect(describeNextDayForecast(forecastPayload({ values: [1.2, 1.25] }), [], NOW).guide).toBeNull();
    expect(describeNextDayForecast(forecastPayload({ values: [1.8, 1.6, 1.4] }), [], NOW)).toMatchObject({ direction: 'fall', low: { value: 1.4 } });
    expect(describeNextDayForecast(forecastPayload({ values: [1.5, 1.51] }), [], NOW).direction).toBe('steady');
  });
});

describe('CurrentConditions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows every part with its own evidence time when all sources are fresh', async () => {
    await renderSummary({});

    expect(within(tile('HPP status')).getByText('Open')).toBeInTheDocument();
    expect(within(tile('HPP status')).getByText(/Recorded by the HPP status check since 15 Mar 2026/)).toBeInTheDocument();

    const colwick = tile('Colwick level now');
    expect(within(colwick).getByText('1.50 m')).toBeInTheDocument();
    expect(within(colwick).getByText('Observed 11:50 (10 minutes ago)')).toBeInTheDocument();
    expect(within(colwick).getByText('Rising 8 cm over 2 hours')).toBeInTheDocument();
    expect(within(colwick).getByText(/Below HPP's 2.2 m guide level/)).toBeInTheDocument();

    const forecast = tile('Next 24 hours (model forecast)');
    expect(within(forecast).getByText('Predicted to rise')).toBeInTheDocument();
    expect(within(forecast).getByText(/Highest about 1.70 m around .*indicative range \d\.\d\d m–\d\.\d\d m/)).toBeInTheDocument();
    expect(within(forecast).getByText(/Forecast made 11:40 \(20 minutes ago\)/)).toBeInTheDocument();

    const gauges = tile('Nearby and upstream gauges');
    const clifton = gauges.querySelector('[data-gauge="4126-level"]');
    expect(clifton).toHaveTextContent('1.50 m');
    expect(clifton).toHaveTextContent("Level above this gauge's own datum. Rising 8 cm over 2 hours.");
    expect(gauges.querySelector('[data-gauge="4007-flow"]')).toHaveTextContent('85.2 m³/s');
    expect(gauges.querySelector('[data-gauge="4067-level"]')).toHaveTextContent('Falling 40 cm over 2 hours');

    const links = screen.getByRole('navigation', { name: 'River condition details' });
    expect(within(links).getByText('Trent gauges')).toHaveAttribute('href', '/trentweirs');
    expect(within(links).getByText('Forecast detail')).toHaveAttribute('href', '/forecastinfo');
    expect(within(links).getByText('River history')).toHaveAttribute('href', '/history');
    expect(within(links).getByText('Recent rainfall')).toHaveAttribute('href', '/trentweirs#rainfall');
  });

  it('shows no fabricated reading, change or status while loading', async () => {
    mockResponses({
      '/api/hppstatus': pending(),
      '/api/levels': pending(),
      '/api/s3forecast': pending(),
      '/api/forecastaccuracy': pending(),
      '/api/trentweirs': pending(),
    });
    render(<CurrentConditions />);
    await act(async () => { jest.advanceTimersByTime(1); });

    const section = screen.getByRole('region', { name: 'Conditions now and next 24 hours' });
    expect(section).not.toHaveTextContent(/\d\.\d\d m/);
    expect(section).not.toHaveTextContent(/Open|Closed|Rising|Falling|Steady/);
    expect(within(section).getAllByRole('status').length).toBe(4);
  });

  it('keeps the recorded status when HPP is closed although the level is below 2.2 m', async () => {
    await renderSummary({
      '/api/hppstatus': ok({ currentStatus: false, lastChangedAt: at(60), health: { state: 'fresh' } }),
    });

    expect(within(tile('HPP status')).getByText('Closed (water levels)')).toBeInTheDocument();
    const colwick = tile('Colwick level now');
    expect(within(colwick).getByText(/This reading is below 2.2 m but HPP's recorded status is still closed/)).toBeInTheDocument();
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });

  it('shows an event closure ahead of the recorded open status', async () => {
    await renderSummary({}, { cachedEvents: [{ event_start_date: at(60), event_end_date: at(-60) }] });
    expect(within(tile('HPP status')).getByText('Closed for an event')).toBeInTheDocument();
    expect(within(tile('HPP status')).queryByText('Open')).not.toBeInTheDocument();
  });

  it('never infers HPP status from the level when the status is unavailable', async () => {
    await renderSummary({ '/api/hppstatus': ok({ isEmpty: true, currentStatus: null, health: { state: 'unavailable' } }) });

    const status = tile('HPP status');
    expect(within(status).getByText(/recorded status is unavailable right now\./)).toBeInTheDocument();
    expect(within(status).queryByText(/Open|Closed/)).not.toBeInTheDocument();
    // The other parts still show their own evidence.
    expect(within(tile('Colwick level now')).getByText('1.50 m')).toBeInTheDocument();
    expect(within(tile('Next 24 hours (model forecast)')).getByText('Predicted to rise')).toBeInTheDocument();
  });

  it('labels a predicted crossing as a prediction, not an announced closure', async () => {
    await renderSummary({ '/api/s3forecast': ok(forecastPayload({ values: [1.9, 2.3, 2.4] })) });

    const forecast = tile('Next 24 hours (model forecast)');
    expect(within(forecast).getByText(/Forecast to reach 2.2 m\./)).toBeInTheDocument();
    // The recorded status is unchanged by the forecast.
    expect(within(tile('HPP status')).getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText(/HPP (will|is going to) close/i)).not.toBeInTheDocument();
  });

  it('degrades each part independently when sources fail', async () => {
    await renderSummary({
      '/api/levels': ok({ level_data: [], health: { state: 'unavailable' } }),
      '/api/s3forecast': failed(),
      '/api/forecastaccuracy': failed(),
      '/api/trentweirs': failed(),
    });

    expect(within(tile('HPP status')).getByText('Open')).toBeInTheDocument();
    expect(within(tile('Colwick level now')).getByText(/latest Colwick level is unavailable/)).toBeInTheDocument();
    expect(within(tile('Colwick level now')).queryByText(/0\.00/)).not.toBeInTheDocument();
    expect(within(tile('Next 24 hours (model forecast)')).getByText('The forecast is unavailable right now.')).toBeInTheDocument();
    expect(within(tile('Nearby and upstream gauges')).getByText(/Nearby gauge readings are unavailable/)).toBeInTheDocument();
  });

  it('shows the forecast without a range when accuracy fails', async () => {
    await renderSummary({ '/api/forecastaccuracy': failed() });
    const forecast = tile('Next 24 hours (model forecast)');
    expect(within(forecast).getByText(/^Highest about 1.70 m around [^(]*\.$/)).toBeInTheDocument();
    expect(within(forecast).getByText('The indicative range is unavailable right now.')).toBeInTheDocument();
  });

  it('flags stale readings and an old forecast, and keeps saved gauge readings with their ages', async () => {
    await renderSummary({
      '/api/levels': ok({ level_data: levelRows(RISING, 180), health: { state: 'stale' } }),
      '/api/s3forecast': ok(forecastPayload({ madeMinutesAgo: 180 })),
      '/api/trentweirs': { ...ok(trentPayload()), error: new Error('refresh failed') },
    });

    expect(within(tile('Colwick level now')).getByText(/Observed 09:00 \(3 hours ago\), so it may be out of date\./)).toHaveAttribute('data-state', 'stale');
    expect(within(tile('Next 24 hours (model forecast)')).getByText('This forecast was made 3 hours ago, so it may be out of date.')).toHaveAttribute('data-state', 'stale');

    const gauges = tile('Nearby and upstream gauges');
    expect(within(gauges).getByText(/could not be refreshed just now/)).toBeInTheDocument();
    const kegworth = gauges.querySelector('[data-gauge="4074-level"]');
    expect(kegworth).toHaveTextContent('3.40 m');
    expect(kegworth).toHaveTextContent('Recent movement unknown');
    expect(kegworth).toHaveTextContent(/3 hours ago\), so it may be out of date/);
  });

  it('lists a missing gauge as having no recent reading', async () => {
    await renderSummary({ '/api/trentweirs': ok({ stations: [{ stationId: 4126, measures: { level: { readings: gaugeReadings(RISING) } } }] }) });
    const gauges = tile('Nearby and upstream gauges');
    expect(gauges.querySelector('[data-gauge="4007-level"]')).toHaveTextContent('No recent reading');
    expect(gauges.querySelector('[data-gauge="4126-level"]')).toHaveTextContent('1.50 m');
  });

  it('reports an incomplete Colwick series as unknown movement', async () => {
    await renderSummary({ '/api/levels': ok({ level_data: levelRows([1.5, 1.49]) }) });
    expect(within(tile('Colwick level now')).getByText('Recent movement unknown: recent readings are incomplete')).toBeInTheDocument();
  });
});
