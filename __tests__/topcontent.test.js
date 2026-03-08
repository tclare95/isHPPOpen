/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import TopContent from '../components/layout/frontpage/topcontent';
import GraphContext from '../libs/context/graphcontrol';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);
jest.mock('../components/functional/opentitle', () => () => <div data-testid="open-title" />);
jest.mock('../components/functional/vomitfactor', () => ({ levelData, csoData }) => (
  <div data-testid="vomit-factor">{`${levelData.length}:${csoData.length}`}</div>
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
      '/api/waterquality/csodensity': { data: undefined, error: undefined, isPending: true },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The River Level is/)).toHaveTextContent('The River Level is 0.00 M');
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
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
      '/api/waterquality/csodensity': {
        data: [{ timestamp: '2026-03-08T10:00:00Z', numberCSOsPerKm2: 1.2 }],
        error: undefined,
        isPending: false,
      },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The River Level is/)).toHaveTextContent('The River Level is 1.45 M');
    expect(screen.getByTestId('vomit-factor')).toHaveTextContent('1:1');
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
      '/api/waterquality/csodensity': {
        data: [],
        error: undefined,
        isPending: false,
      },
    });

    renderWithGraphContext(<TopContent cachedEvents={[]} />);

    expect(screen.getByText(/The River Level is/)).toHaveTextContent('The River Level is unavailable');
    expect(screen.getByText('Forecast and level data are unavailable right now.')).toBeInTheDocument();
  });
});
