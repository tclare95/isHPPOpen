import { render, screen } from '@testing-library/react';
import ChartRender from '../components/functional/chart';
import ForecastChart from '../components/functional/forecastChart';
import StabilityChart from '../components/functional/stabilityChart';

jest.mock('react-google-charts', () => function MockChart({ data }) {
  return <div data-testid="chart" data-rows={JSON.stringify(data)} />;
});
const rows = () => JSON.parse(screen.getByTestId('chart').getAttribute('data-rows'));
const history = [{ reading_date: '2026-03-08T09:00:00Z', reading_level: 1.2 }];
const forecast = [{ forecast_date: '2026-03-08T11:00:00Z', forecast_reading: 1.5 }];
const accuracy = [{ horizon_hours: 0, mae: 0.1 }];

describe('Chart input transformations', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-03-08T10:00:00Z')));
  afterEach(() => jest.useRealTimers());

  test.each([ChartRender, ForecastChart])('%p preserves rows, bounds and input-triggered clock samples', (Component) => {
    const props = { graphData: history, graphForeCastData: forecast, lowerBound: 0.5, upperBound: 2, accuracyData: accuracy };
    const view = render(<Component {...props} />);
    expect(rows().slice(1).map((row) => row[0])).toEqual(['2026-03-08T09:00:00.000Z', '2026-03-08T10:00:00.000Z', '2026-03-08T11:00:00.000Z']);
    expect(rows()[1].slice(3, 7)).toEqual([1.2, 0.5, 2, null]);
    expect(rows()[3].slice(3, 7)).toEqual([null, 0.5, 2, 1.5]);
    jest.setSystemTime(new Date('2026-03-08T10:30:00Z'));
    view.rerender(<Component {...props} />);
    expect(rows().find((row) => row[1] === 'Now')[0]).toBe('2026-03-08T10:00:00.000Z');
    view.rerender(<Component {...props} lowerBound={0.8} />);
    expect(rows().find((row) => row[1] === 'Now')[0]).toBe('2026-03-08T10:30:00.000Z');
    expect(rows()[1][4]).toBe(0.8);
    view.rerender(<Component {...props} graphData={[]} graphForeCastData={[]} />);
    expect(rows()).toHaveLength(2); // Header and Now, without stale input rows.
  });

  test('forecast confidence follows accuracy data and the visibility toggle', () => {
    const props = { graphData: history, graphForeCastData: forecast, lowerBound: 0.5, upperBound: 2, accuracyData: accuracy };
    const view = render(<ForecastChart {...props} />);
    expect(rows()[3][7]).toBeCloseTo(1.5 - 1.96 * 0.1);
    expect(rows()[3][8]).toBeCloseTo(1.5 + 1.96 * 0.1);
    view.rerender(<ForecastChart {...props} accuracyData={[{ horizon_hours: 0, mae: 0.2 }]} />);
    expect(rows()[3][7]).toBeCloseTo(1.5 - 1.96 * 0.2);
    view.rerender(<ForecastChart {...props} showConfidence={false} />);
    expect(rows()[3].slice(7)).toEqual([null, null]);
  });

  test('stability rows sort, update and clear when inputs disappear', () => {
    const makeRow = (hour, value) => ({ target_time: `2026-03-08T${hour}:00:00Z`, forecast_current: value, historical_forecasts: [1, 2, 3, 4, 5, 6, 7] });
    const view = render(<StabilityChart stabilityData={[makeRow('12', 1.4), makeRow('11', 1.3)]} />);
    expect(rows().slice(1)).toEqual([
      ['2026-03-08T11:00:00.000Z', 1.3, 1, 2, 3, 4, 5, 6],
      ['2026-03-08T12:00:00.000Z', 1.4, 1, 2, 3, 4, 5, 6],
    ]);
    view.rerender(<StabilityChart stabilityData={[makeRow('13', 1.6)]} />);
    expect(rows()).toHaveLength(2);
    expect(rows()[1][1]).toBe(1.6);
    view.rerender(<StabilityChart stabilityData={[]} />);
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('No stability data available for chart')).toBeInTheDocument();
  });
});
