/* eslint-disable react/prop-types */
import { fireEvent, render, screen } from '@testing-library/react';
import WaterQualityPage from '../app/waterquality/page';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);
jest.mock('next/dynamic', () => (loader) => {
  const source = loader.toString();
  if (source.includes('csoMap')) return ({ locations }) => <div data-testid="map">{locations.length}</div>;
  return ({ data }) => <div data-testid="density-chart">{data.length}</div>;
});
jest.mock('../components/functional/vomitfactor', () => () => <div data-testid="indicator" />);
jest.mock('../components/functional/csoCatchmentMonitoring', () => () => <div data-testid="catchment" />);
jest.mock('../components/functional/csoEventHistory', () => ({ onShowOnMap }) => <button type="button" data-testid="history" onClick={() => onShowOnMap('A')}>history</button>);

describe('WaterQualityPage', () => {
  it('fetches each resource once and shares the result with its sections', () => {
    useFetch.mockImplementation((path) => ({
      data: path === '/api/waterquality' ? { waterQualityData: { ScrapeTimestamp: '2026-08-31T12:00:00Z', statusSummary: { currentlySpilling: 1, recentlyStopped48h: 2, offline: 1, unknown: 1 }, locations: [{ id: 'A' }], health: { state: 'fresh' } } }
        : path === '/api/levels' ? { level_data: [] }
        : [{ timestamp: '2026-08-31T12:00:00Z', numberCSOsPerKm2: 0.01 }],
      error: undefined,
      isPending: false,
    }));
    render(<WaterQualityPage />);
    expect(screen.getByTestId('map')).toHaveTextContent('1');
    expect(screen.getByTestId('density-chart')).toHaveTextContent('1');
    expect(screen.getByText('Currently spilling').previousSibling).toHaveTextContent('1');
    expect(screen.queryByText(/HPP paddling guidance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fresh monitors/i)).not.toBeInTheDocument();
    expect(screen.getByText(/contents may still be travelling downstream/i)).toBeInTheDocument();
    expect(useFetch).toHaveBeenCalledTimes(4);
    expect(useFetch.mock.calls.map(([path]) => path)).toEqual([null, '/api/waterquality', '/api/waterquality/csodensity?hours=120', '/api/levels']);
    fireEvent.change(screen.getByLabelText('Explore the river at Holme Pierrepont'), { target: { value: 'downstream' } });
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/river?direction=downstream', expect.objectContaining({ shouldRetryOnError: false }));
    expect(screen.getByTestId('indicator')).toBeInTheDocument();
    expect(screen.getByTestId('catchment')).toBeInTheDocument();
  });

  it('counts fresh not-spilling reports separately from unavailable status, without calling them clear (#114)', () => {
    const locations = [
      { id: 'A', status: 'active', statusReason: 'spilling' },
      { id: 'B', status: 'offline', statusReason: 'offline' },
      { id: 'C', status: 'unknown', statusReason: 'stale' },
      ...['D', 'E', 'F'].map((id) => ({ id, status: 'unknown', statusReason: 'not_spilling_no_recent_event' })),
    ];
    useFetch.mockImplementation((path) => ({
      data: path === '/api/waterquality' ? { waterQualityData: { statusSummary: { currentlySpilling: 1, recentlyStopped48h: 0, offline: 1, unknown: 4 }, locations, health: { state: 'fresh' } } }
        : path === '/api/levels' ? { level_data: [] } : [],
      error: undefined, isPending: false,
    }));
    render(<WaterQualityPage />);
    expect(screen.getByText('Status unavailable').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('3 other upstream locations: not spilling, no spill in the last 48 hours.')).toBeInTheDocument();
  });

  it('reports current CSO status as unavailable instead of showing zero spills when RDP has no usable status', () => {
    useFetch.mockImplementation((path) => ({
      data: path === '/api/waterquality' ? { waterQualityData: { ScrapeTimestamp: '2026-08-31T12:00:00Z',
        statusSummary: { currentlySpilling: null, recentlyStopped48h: null, offline: null, unknown: 2 },
        locations: [{ id: 'A', status: 'unknown', statusReason: 'rdp_unavailable' }, { id: 'B', status: 'unknown', statusReason: 'rdp_unavailable' }],
        health: { state: 'unavailable', cso: { origin: 'rdp', available: false } } } }
        : path === '/api/levels' ? { level_data: [] } : [],
      error: undefined,
      isPending: false,
    }));
    render(<WaterQualityPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/Current CSO status is temporarily unavailable/);
    expect(screen.queryByText('Currently spilling')).not.toBeInTheDocument();
    expect(screen.queryByText('Stopped in 48 hours')).not.toBeInTheDocument();
  });
});
