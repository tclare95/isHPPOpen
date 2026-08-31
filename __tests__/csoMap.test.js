/* eslint-disable react/prop-types */
import { fireEvent, render, screen } from '@testing-library/react';
import WaterQualityMap from '../components/functional/csoMap';

jest.mock('leaflet', () => ({ divIcon: (config) => config }));
jest.mock('next/dynamic', () => (loader) => {
  const source = loader.toString();
  if (source.includes('MapContainer')) return ({ children }) => <div data-testid="map-container">{children}</div>;
  if (source.includes('TileLayer')) return () => <div />;
  if (source.includes('react-leaflet-cluster')) return ({ children }) => <div data-testid="cluster">{children}</div>;
  if (source.includes('mod.Marker')) return ({ children }) => <div data-testid="marker">{children}</div>;
  if (source.includes('mod.Popup')) return ({ children }) => <div>{children}</div>;
  return ({ children }) => <div>{children}</div>;
});

const now = new Date('2026-08-31T12:00:00Z');
const locations = [
  { id: 'ACTIVE', status: 'active', coordinates: { x: -1.2, y: 52.9 }, receivingWaterCourse: 'River Trent', latestEventStart: '2026-08-31T10:00:00Z', eventDurationMinutes: 120, observedAt: '2026-08-31T11:55:00Z' },
  { id: 'RECENT', status: 'recent', coordinates: { x: -1.3, y: 53 }, latestEventStart: '2026-08-31T05:00:00Z', latestEventEnd: '2026-08-31T07:00:00Z', eventDurationMinutes: 120, observedAt: '2026-08-31T11:55:00Z' },
  { id: 'NO_COORDS', status: 'active', coordinates: null },
];

describe('WaterQualityMap', () => {
  it('renders loading, error and empty states', () => {
    const { rerender } = render(<WaterQualityMap isPending />);
    expect(screen.getByText('Loading map data…')).toBeInTheDocument();
    rerender(<WaterQualityMap error={new Error('boom')} />);
    expect(screen.getByText('Unable to load map data right now.')).toBeInTheDocument();
    rerender(<WaterQualityMap locations={[]} />);
    expect(screen.getByText('No CSO location data is available.')).toBeInTheDocument();
  });

  it('plots valid locations, filters recent events and warns for stale data', () => {
    render(<WaterQualityMap locations={locations} health={{ state: 'stale' }} now={now} />);
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByText('Currently spilling')).toBeInTheDocument();
    expect(screen.getByText('≈')).toBeInTheDocument();
    expect(screen.getByText(/flow remains downstream/i)).toBeInTheDocument();
    expect(screen.getByText(/No stale location is labelled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Current' }));
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    expect(screen.queryByText('RECENT')).not.toBeInTheDocument();
  });
});
