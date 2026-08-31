/* eslint-disable react/prop-types */
import { fireEvent, render, screen } from '@testing-library/react';
import CsoChart from '../components/functional/csoChart';

jest.mock('next/dynamic', () => () => ({ data }) => <div data-testid="chart" data-chart={JSON.stringify(data)} />);

describe('CsoChart', () => {
  it('renders loading, error and empty states', () => {
    const { rerender } = render(<CsoChart isPending />);
    expect(screen.getByText('Loading chart…')).toBeInTheDocument();
    rerender(<CsoChart error={new Error('boom')} />);
    expect(screen.getByText('Unable to load chart data right now.')).toBeInTheDocument();
    rerender(<CsoChart data={[]} />);
    expect(screen.getByText('No chart data is available.')).toBeInTheDocument();
  });

  it('buckets readings hourly and changes the selected window', () => {
    const onHoursChange = jest.fn();
    render(<CsoChart data={[
      { timestamp: '2026-08-31T10:05:00Z', numberCSOsPerKm2: 0.01 },
      { timestamp: '2026-08-31T10:20:00Z', numberCSOsPerKm2: 0.03 },
      { timestamp: '2026-08-31T11:05:00Z', numberCSOsPerKm2: 0.04 },
    ]} hours={120} onHoursChange={onHoursChange} />);
    const data = JSON.parse(screen.getByTestId('chart').dataset.chart);
    expect(data).toHaveLength(3);
    expect(data[1][1]).toBe(0.02);
    expect(screen.getByText('Activity is rising')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '24 hours' }));
    expect(onHoursChange).toHaveBeenCalledWith(24);
  });
});
