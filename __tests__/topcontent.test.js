/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import TopContent from '../components/layout/frontpage/topcontent';
import GraphContext from '../libs/context/graphcontrol';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);
jest.mock('../components/functional/opentitle', () => () => <div data-testid="open-title" />);
jest.mock('../components/functional/vomitfactor', () => ({ assessment, isPending }) => (
  <div data-testid="vomit-factor">{isPending ? 'pending' : assessment?.level ?? 'none'}</div>
));
jest.mock('../components/functional/weirlevels', () => ({ currentLevel }) => (
  <div data-testid="weir-levels">{currentLevel}</div>
));
jest.mock('../components/functional/forecastChart', () => ({ graphData, graphForeCastData, accuracyData }) => (
  <div data-testid="forecast-chart">{`${graphData.length}:${graphForeCastData.length}:${accuracyData.length}`}</div>
));

const mockUseFetch = useFetch;

function renderWithGraphContext(ui) {
  return render(
    <GraphContext.Provider
      value={{
        lowerBound: 0.96,
        upperBound: 2.2,
        updateBounds: jest.fn(),
      }}
    >
      {ui}
    </GraphContext.Provider>
  );
}

function mockResponses(responses) {
  mockUseFetch.mockImplementation((path) => {
    if (path in responses) {
      return responses[path];
    }

    return { data: undefined, error: undefined, isPending: false };
  });
}

describe('TopContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state while the levels request is pending', () => {
    mockResponses({
      '/api/levels': { data: undefined, error: undefined, isPending: true },
      '/api/s3forecast': { data: undefined, error: undefined, isPending: true },
      '/api/forecastaccuracy': { data: undefined, error: undefined, isPending: true },
      '/api/waterquality/assessment': { data: undefined, error: undefined, isPending: true },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    // Never a fabricated reading while loading.
    expect(screen.getByText(/The river level is/)).toHaveTextContent('The river level is loading');
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hours? old/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('weir-levels')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('treats the levels fallback payload as unavailable, not as 0 m', () => {
    mockResponses({
      '/api/levels': { data: { level_data: [], forecast_data: [], health: { state: 'unavailable' } }, error: undefined, isPending: false },
      '/api/s3forecast': { data: { forecast_data: [] }, error: undefined, isPending: false },
      '/api/forecastaccuracy': { data: { accuracy_data: [] }, error: undefined, isPending: false },
      '/api/waterquality/assessment': { data: undefined, error: undefined, isPending: false },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The river level is/)).toHaveTextContent('The river level is unavailable');
    expect(screen.getByText(/latest river level reading is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 hours/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('weir-levels')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vomit-factor')).not.toBeInTheDocument();
  });

  it('shows the age of a fresh reading and flags a stale one', () => {
    const at = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
    const respond = (minutes) => mockResponses({
      '/api/levels': { data: { level_data: [{ reading_date: at(minutes), reading_level: 2.2 }] }, error: undefined, isPending: false },
      '/api/s3forecast': { data: { forecast_data: [] }, error: undefined, isPending: false },
      '/api/forecastaccuracy': { data: { accuracy_data: [] }, error: undefined, isPending: false },
      '/api/waterquality/assessment': { data: undefined, error: undefined, isPending: false },
    });

    respond(12);
    const { unmount } = renderWithGraphContext(<TopContent cachedEvents={[]} />);
    expect(screen.getByText(/The river level is/)).toHaveTextContent('The river level is 2.20 m');
    expect(screen.getByText(/reading is 12 minutes old\./)).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
    unmount();

    respond(150);
    const second = renderWithGraphContext(<TopContent cachedEvents={[]} />);
    expect(screen.getByText(/reading is 2 hours old, so it may be out of date\./)).toBeInTheDocument();
    second.unmount();

    // Stale for decisions (over 30 minutes) but under the 2-hour display threshold: plain age line, no warning.
    respond(60);
    const third = renderWithGraphContext(<TopContent cachedEvents={[]} />);
    expect(screen.getByText(/reading is 1 hour old\./)).toBeInTheDocument();
    expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
    expect(document.querySelector('[data-state="stale"]')).toBeNull();
    third.unmount();

    respond(180);
    renderWithGraphContext(<TopContent cachedEvents={[]} />);
    expect(screen.getAllByText(/may be out of date/)).toHaveLength(1);
    expect(document.querySelectorAll('[data-state="stale"]')).toHaveLength(1);
  });

  it('renders shared fetch data in dependent child components', () => {
    mockResponses({
      '/api/levels': {
        data: {
          level_data: [{ reading_date: '2026-03-08T10:00:00Z', reading_level: 1.45 }],
        },
        error: undefined,
        isPending: false,
      },
      '/api/s3forecast': {
        data: { forecast_data: [{ forecast_date: '2026-03-08T12:00:00Z', forecast_reading: 1.55 }] },
        error: undefined,
        isPending: false,
      },
      '/api/forecastaccuracy': {
        data: { accuracy_data: [{ observed: 1.4, forecast: 1.5 }] },
        error: undefined,
        isPending: false,
      },
      '/api/waterquality/assessment': {
        data: { source: 'rdp', current: { level: 'elevated', label: 'Elevated', reasons: [] } },
        error: undefined,
        isPending: false,
      },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The river level is/)).toHaveTextContent('The river level is 1.45 m');
    // The front page shows the server's assessment; it no longer computes one from density rows (#wq-assessment).
    expect(screen.getByTestId('vomit-factor')).toHaveTextContent('elevated');
    expect(mockUseFetch.mock.calls.map(([path]) => path)).not.toContain('/api/waterquality/csodensity?hours=3');
    expect(screen.getByTestId('weir-levels')).toHaveTextContent('1.45');
    expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:1:1');
  });

  it('renders a recoverable error message when operational data fails', () => {
    mockResponses({
      '/api/levels': {
        data: undefined,
        error: new Error('levels unavailable'),
        isPending: false,
      },
      '/api/s3forecast': {
        data: undefined,
        error: new Error('forecast unavailable'),
        isPending: false,
      },
      '/api/forecastaccuracy': {
        data: undefined,
        error: undefined,
        isPending: false,
      },
      '/api/waterquality/assessment': {
        data: undefined,
        error: undefined,
        isPending: false,
      },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The river level is/)).toHaveTextContent('The river level is unavailable');
    expect(screen.getByText('Forecast and level data are unavailable right now.')).toBeInTheDocument();
  });
  describe('partial chart data', () => {
    const at = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
    const levels = { data: { level_data: [{ reading_date: at(10), reading_level: 1.3 }] }, error: undefined, isPending: false };
    const forecastMadeAgo = (minutes) => ({
      data: { forecast_data: [{ forecast_date: at(-15), forecast_reading: 1.32 }], metadata: { forecast_time: at(minutes) } },
      error: undefined,
      isPending: false,
    });
    const accuracy = { data: { accuracy_data: [{ horizon_hours: 6, mae: 0.04 }] }, error: undefined, isPending: false };
    const assessment = { data: undefined, error: undefined, isPending: false };

    it('keeps the observed levels and says so when the forecast fails', () => {
      mockResponses({
        '/api/levels': levels,
        '/api/s3forecast': { data: undefined, error: new Error('forecast unavailable'), isPending: false },
        '/api/forecastaccuracy': accuracy,
        '/api/waterquality/assessment': assessment,
      });

      renderWithGraphContext(<TopContent cachedEvents={[]} />);

      expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:0:1');
      expect(screen.getByText(/forecast is unavailable right now, so only observed levels are shown/)).toBeInTheDocument();
      expect(screen.queryByText('Forecast and level data are unavailable right now.')).not.toBeInTheDocument();
    });

    it('keeps the chart when only the accuracy read fails, without a confidence band', () => {
      mockResponses({
        '/api/levels': levels,
        '/api/s3forecast': forecastMadeAgo(20),
        '/api/forecastaccuracy': { data: undefined, error: new Error('accuracy unavailable'), isPending: false },
        '/api/waterquality/assessment': assessment,
      });

      renderWithGraphContext(<TopContent cachedEvents={[]} />);

      expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:1:0');
      expect(screen.getByText(/confidence band is unavailable right now/)).toBeInTheDocument();
      expect(screen.queryByText(/may be out of date/)).not.toBeInTheDocument();
    });

    it('marks a forecast older than an hour as possibly out of date', () => {
      mockResponses({
        '/api/levels': levels,
        '/api/s3forecast': forecastMadeAgo(180),
        '/api/forecastaccuracy': accuracy,
        '/api/waterquality/assessment': assessment,
      });

      renderWithGraphContext(<TopContent cachedEvents={[]} />);

      expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:1:1');
      expect(screen.getByText('This forecast was made 3 hours ago, so it may be out of date.')).toHaveAttribute('data-state', 'stale');
    });

    it('keeps the last loaded forecast, judged by its run time, when a refresh fails', () => {
      mockResponses({
        '/api/levels': levels,
        '/api/s3forecast': { ...forecastMadeAgo(20), error: new Error('refresh failed') },
        '/api/forecastaccuracy': accuracy,
        '/api/waterquality/assessment': assessment,
      });

      renderWithGraphContext(<TopContent cachedEvents={[]} />);

      expect(screen.getByTestId('forecast-chart')).toHaveTextContent('1:1:1');
      expect(screen.queryByText(/forecast is unavailable/)).not.toBeInTheDocument();
    });
  });
});
