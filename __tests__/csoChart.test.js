/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import CsoChart from '../components/functional/csoChart';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/dynamic', () => () => {
  const MockChart = ({ data }) => <div data-testid="chart" data-chart={JSON.stringify(data)} />;
  return MockChart;
});

const mockUseFetch = useFetch;

describe('CsoChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state while data is pending', () => {
    mockUseFetch.mockReturnValue({ data: undefined, error: undefined, isPending: true });

    render(<CsoChart />);

    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('renders error state when the request fails', () => {
    mockUseFetch.mockReturnValue({ data: undefined, error: new Error('boom'), isPending: false });

    render(<CsoChart />);

    expect(screen.getByText('Unable to load chart data right now.')).toBeInTheDocument();
  });

  it('renders empty state when no valid rows are returned', () => {
    mockUseFetch.mockReturnValue({ data: [], error: undefined, isPending: false });

    render(<CsoChart />);

    expect(screen.getByText('No chart data available.')).toBeInTheDocument();
  });

  it('renders chart data from useFetch', () => {
    mockUseFetch.mockReturnValue({
      data: [
        { timestamp: '2026-03-08T10:00:00Z', numberCSOsPerKm2: 1.5 },
        { timestamp: '2026-03-08T11:00:00Z', numberCSOsPerKm2: 1.75 },
      ],
      error: undefined,
      isPending: false,
    });

    render(<CsoChart />);

    const chart = screen.getByTestId('chart');
    const data = JSON.parse(chart.dataset.chart);

    expect(data).toHaveLength(3);
    expect(data[1][1]).toBe(1.5);
    expect(data[2][1]).toBe(1.75);
  });
});
