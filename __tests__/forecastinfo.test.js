import { fireEvent, render, screen } from '@testing-library/react';
import ForecastInfoPage from '../app/forecastinfo/page';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);
jest.mock('../components/functional/stabilityChart', () => () => <div data-testid="stability-chart" />);
jest.mock('../components/functional/forecastChart', () => ({ graphData, graphForeCastData, accuracyData, showConfidence }) => (
  <div data-testid="forecast-chart">{`${graphData.length}:${graphForeCastData.map((row) => row.forecast_reading).join(',')}:${accuracyData?.length ?? 'none'}:${showConfidence}`}</div>
));

function buildResponses(levelForecast = []) {
  return {
    '/api/levels': { data: { level_data: [{ reading_date: '2026-11-13T10:00:00Z', reading_level: 1.2 }], forecast_data: levelForecast }, isPending: false },
    '/api/s3forecast': {
      data: {
        forecast_data: [
          { forecast_date: '2026-11-13T10:15:00Z', forecast_reading: 1.25, horizon_hours: 0.25 },
          { forecast_date: '2026-11-13T10:30:00Z', forecast_reading: 1.3, horizon_hours: 0.5 },
        ],
        metadata: { forecast_time: '2026-11-13T10:00:00Z', current_level: 1.2 },
      },
      isPending: false,
    },
    '/api/forecastaccuracy': { data: { accuracy_data: [{ horizon_hours: 6, mae: 0.04, rmse: 0.05, bias: 0.01 }], evaluation_time: '2026-11-13T09:00:00Z' }, isPending: false },
    '/api/forecaststability': { data: { stability_data: [{ target_time: '2026-11-13T12:00:00Z', stability_std: 0.05, forecast_current: 1.3 }] }, isPending: false },
  };
}

function mockResponses(responses) {
  useFetch.mockImplementation((path) => responses[path] ?? { data: undefined, isPending: false });
}

describe('ForecastInfoPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResponses(buildResponses());
  });

  it('shows the predictor forecast with observed levels, accuracy and confidence by default', () => {
    render(<ForecastInfoPage />);

    expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:1.25,1.3:1:true');
    expect(screen.getByText('Forecast Accuracy')).toBeInTheDocument();
    expect(screen.getByLabelText('Show 95% confidence interval')).toBeChecked();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Forecast Stability')).toBeInTheDocument();
  });

  it('has no EA forecast selector and never charts /api/levels forecast_data', () => {
    mockResponses(buildResponses([{ forecast_date: '2026-11-13T11:00:00Z', forecast_reading: 9.9 }]));
    render(<ForecastInfoPage />);

    expect(screen.queryByRole('button', { name: /EA Forecast/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Forecast/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('forecast-chart')).not.toHaveTextContent('9.9');
  });

  it('turns the confidence interval off and opens stability details', () => {
    render(<ForecastInfoPage />);

    fireEvent.click(screen.getByLabelText('Show 95% confidence interval'));
    expect(screen.getByTestId('forecast-chart')).toHaveTextContent(':false');

    fireEvent.click(screen.getByText('Forecast Stability'));
    expect(screen.getByTestId('stability-chart')).toBeInTheDocument();
  });
});
