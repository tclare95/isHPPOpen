/* eslint-disable react/prop-types */
import { fireEvent, render, screen } from '@testing-library/react';
import WaterQualityMap from '../components/functional/csoMap';
import { compactImpact } from '../testUtils/rdpImpactFixtures';

jest.mock('leaflet', () => ({ divIcon: (config) => config }));
jest.mock('next/dynamic', () => (loader) => {
  const source = loader.toString();
  if (source.includes('MapContainer')) return ({ children }) => <div data-testid="map-container">{children}</div>;
  if (source.includes('TileLayer')) return () => <div />;
  if (source.includes('react-leaflet-cluster')) return ({ children }) => <div data-testid="cluster">{children}</div>;
  if (source.includes('mod.Marker')) return ({ children }) => <div data-testid="marker">{children}</div>;
  if (source.includes('mod.Popup')) return ({ children }) => <div>{children}</div>;
  if (source.includes('mod.GeoJSON')) return ({ data, style }) => (data.riverTracer ? <div data-testid="river-layer">{data.riverTracer.kind}</div> : (
    <div data-testid="impact-layer">{data.features.map((f) => <span key={f.properties.reachId} data-testid="impact-reach"
      data-reach={f.properties.reachId} data-weight={style(f).weight} data-color={style(f).color} />)}</div>));
  return ({ children }) => <div>{children}</div>;
});

const now = new Date('2026-08-31T12:00:00Z');
const locations = [
  { id: 'ACTIVE', status: 'active', coordinates: { x: -1.2, y: 52.9 }, receivingWaterCourse: 'River Trent', latestEventStart: '2026-08-31T10:00:00Z', eventDurationMinutes: 120, observedAt: '2026-08-31T11:55:00Z' },
  { id: 'RECENT', status: 'recent', coordinates: { x: -1.3, y: 53 }, latestEventStart: '2026-08-31T05:00:00Z', latestEventEnd: '2026-08-31T07:00:00Z', eventDurationMinutes: 120, observedAt: '2026-08-31T11:55:00Z' },
  { id: 'NO_COORDS', status: 'active', coordinates: null },
];

describe('WaterQualityMap', () => {
  it('keeps the independent river layer when the spill filter has no markers', () => {
    const riverTrace = { type: 'FeatureCollection', features: [{}], riverTracer: { releaseVersion: 'fixture', kind: 'point-downstream' } };
    render(<WaterQualityMap locations={[]} health={{ state: 'fresh' }} riverTrace={riverTrace} now={now} />);
    expect(screen.getByTestId('river-layer')).toHaveTextContent('point-downstream');
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument();
  });
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

  it('plots an outfall selected from the spill history and links back to it', () => {
    const onShowHistory = jest.fn();
    const idle = { id: 'IDLE', status: 'unknown', coordinates: { x: -1.1, y: 52.95 }, receivingWaterCourse: 'River Leen' };
    render(<WaterQualityMap locations={[...locations, idle]} health={{ state: 'fresh' }} now={now} focusId="IDLE" onShowHistory={onShowHistory} />);
    expect(screen.getAllByTestId('marker')).toHaveLength(3);
    expect(screen.getByText('Selected from spill history')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Spill history for this outfall' })[2]);
    expect(onShowHistory).toHaveBeenCalledWith('IDLE');
  });

  describe('RDP membership (#114)', () => {
    const relatedLocations = {
      categories: {
        candidate: { members: 2, currentlySpilling: 1, recentlyStopped48h: 0, offline: 0, unknown: 1 },
        'catchment-only': { members: 3, currentlySpilling: 0, recentlyStopped48h: 1, offline: 0, unknown: 2 },
      },
      locations: [
        { id: 'CAND', assetId: 'severn-trent:storm-overflow-activity:CAND', status: 'active', coordinates: { x: -1.4, y: 52.8 }, relationship: { category: 'candidate' } },
        { id: 'CATCH', assetId: 'severn-trent:storm-overflow-activity:CATCH', status: 'recent', coordinates: { x: -1.5, y: 52.7 }, latestEventEnd: '2026-08-31T10:00:00Z', relationship: { category: 'catchment-only' } },
      ],
    };
    const membership = { source: 'rdp', state: 'available', relationshipSet: 'hpp-upstream-outfalls', version: 'bb422e98d78ee1bc5923',
      scopes: [{ name: 'confirmed', count: 592 }], catalogues: [{ attribution: 'Severn Trent Water' }] };
    const confirmed = locations.map((location) => ({ ...location, relationship: { category: 'confirmed' } }));

    it('keeps possibly-upstream outfalls off the map until asked for, then labels them distinctly', () => {
      const onShowHistory = jest.fn();
      render(<WaterQualityMap locations={confirmed} relatedLocations={relatedLocations} membership={membership} health={{ state: 'fresh' }} now={now} onShowHistory={onShowHistory} />);
      expect(screen.getAllByTestId('marker')).toHaveLength(2);
      expect(screen.getByText('Upstream outfalls: River Data Platform set hpp-upstream-outfalls (bb422e98d78e, 592 confirmed). Data: Severn Trent Water.')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('Show unconfirmed upstream outfalls (2 active or recent)'));
      expect(screen.getAllByTestId('marker')).toHaveLength(4);
      expect(screen.getByText('Possibly upstream: river link not confirmed')).toBeInTheDocument();
      expect(screen.getByText('In the catchment: river link unresolved')).toBeInTheDocument();
      expect(screen.getByText(/Showing 2 locations and 2 not confirmed upstream/)).toBeInTheDocument();
      // Spill history covers confirmed members only.
      expect(screen.getAllByRole('button', { name: 'Spill history for this outfall' })).toHaveLength(2);
      // The time filters apply to both.
      fireEvent.click(screen.getByRole('button', { name: 'Current' }));
      expect(screen.getAllByTestId('marker')).toHaveLength(2);
    });

    it('says the membership is unavailable rather than showing another list', () => {
      render(<WaterQualityMap locations={[]} membership={{ source: 'rdp', state: 'unavailable' }} health={{ state: 'unavailable', cso: { available: false } }} now={now} />);
      expect(screen.getByText('No CSO location data is available.')).toBeInTheDocument();
      expect(screen.getByText(/Upstream outfall list unavailable/)).toBeInTheDocument();
    });

    it('shows no membership note or toggle for the legacy list', () => {
      render(<WaterQualityMap locations={locations} membership={{ source: 'legacy', basis: 'sewage-map-cso-ids', count: 3 }} health={{ state: 'fresh' }} now={now} />);
      expect(screen.queryByText(/River Data Platform set/)).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });

  it('says status is unavailable, not stale, when RDP has no usable status', () => {
    render(<WaterQualityMap locations={[{ id: 'A', status: 'unknown', coordinates: null }]} health={{ state: 'unavailable', cso: { available: false } }} now={now} />);
    expect(screen.getByText(/Current status is unavailable\. No location is labelled as currently spilling or as clear/)).toBeInTheDocument();
    expect(screen.queryByText(/No stale location is labelled/)).not.toBeInTheDocument();
  });

  describe('reported downstream spill impact overlay', () => {
    const spilling = [{ id: 'SVT00001', status: 'active', coordinates: { x: -1.2, y: 52.9 }, receivingWaterCourse: 'River Leen', latestEventStart: '2026-08-31T10:00:00Z', observedAt: '2026-08-31T11:55:00Z' }];
    const weights = () => Object.fromEntries(screen.getAllByTestId('impact-reach').map((el) => [el.dataset.reach, Number(el.dataset.weight)]));

    it('draws reported spills downstream routes with the connectivity caveat and the unknown count', () => {
      render(<WaterQualityMap locations={spilling} health={{ state: 'fresh' }} now={now} impactEnabled impact={compactImpact()} />);
      expect(screen.getAllByTestId('impact-reach')).toHaveLength(2);
      expect(screen.getByText(/do not show pollution concentration, how long it takes to travel, or whether the water is safe/)).toBeInTheDocument();
      expect(screen.getByText(/1 upstream outfalls have no usable current status; their routes are not drawn, and they are not assumed clear/)).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /SVT00001: Currently spilling/ })).toBeInTheDocument();
    });

    it('highlights one selected spill downstream connections and links to its event history', () => {
      const onShowHistory = jest.fn();
      render(<WaterQualityMap locations={spilling} health={{ state: 'fresh' }} now={now} impactEnabled impact={compactImpact()} onShowHistory={onShowHistory} />);
      const before = weights();
      fireEvent.change(screen.getByLabelText(/Highlight one reported spill/), { target: { value: 'severn-trent:storm-overflow-activity:SVT00002' } });
      const after = weights();
      expect(after['3']).toBeGreaterThan(before['3']);
      expect(after['1']).toBeLessThan(before['1']);
      expect(screen.getByText(/Spill cse_000000000000000000000002/)).toBeInTheDocument();
      expect(screen.getByText(/incomplete: the mapped network ends or branches before the sea/)).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole('button', { name: 'Spill history for this outfall' }).at(-1));
      expect(onShowHistory).toHaveBeenLastCalledWith('SVT00002');
    });

    it('selects a route from an existing CSO marker', () => {
      render(<WaterQualityMap locations={spilling} health={{ state: 'fresh' }} now={now} impactEnabled impact={compactImpact()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show downstream route' }));
      expect(screen.getByLabelText(/Highlight one reported spill/)).toHaveValue('severn-trent:storm-overflow-activity:SVT00001');
      expect(weights()['1']).toBeGreaterThan(weights()['3']);
    });

    it('leaves the map working normally when the overlay is off, loading or unavailable', () => {
      const { rerender } = render(<WaterQualityMap locations={locations} health={{ state: 'fresh' }} now={now} />);
      expect(screen.getAllByTestId('marker')).toHaveLength(2);
      expect(screen.queryByTestId('impact-layer')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Show downstream route' })).not.toBeInTheDocument();
      rerender(<WaterQualityMap locations={locations} health={{ state: 'fresh' }} now={now} impactEnabled impactPending />);
      expect(screen.getByText('Loading downstream spill impact…')).toBeInTheDocument();
      rerender(<WaterQualityMap locations={locations} health={{ state: 'fresh' }} now={now} impactEnabled impact={compactImpact()} impactError={new Error('503')} />);
      expect(screen.getAllByTestId('marker')).toHaveLength(2);
      expect(screen.queryByTestId('impact-layer')).not.toBeInTheDocument();
      expect(screen.getByText(/Downstream spill impact is unavailable right now. The rest of the map is unaffected/)).toBeInTheDocument();
    });

    it('says when no reported spill has a drawable route rather than drawing nothing silently', () => {
      const empty = { ...compactImpact(), outfalls: [], reaches: { type: 'FeatureCollection', features: [] }, counts: { active: 0, unresolved: 0, recent: 0, unknown: 4, 'no-reported-discharge': 10 } };
      render(<WaterQualityMap locations={locations} health={{ state: 'fresh' }} now={now} impactEnabled impact={empty} />);
      expect(screen.getByText(/No reported spill in the last 48 hours has a drawable downstream route/)).toBeInTheDocument();
      expect(screen.getByText(/4 upstream outfalls have no usable current status/)).toBeInTheDocument();
    });
  });
});
