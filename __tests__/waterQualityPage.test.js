/* eslint-disable react/prop-types */
import { fireEvent, render, screen } from '@testing-library/react';
import WaterQualityPage from '../app/waterquality/page';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);
jest.mock('next/dynamic', () => (loader) => {
  const source = loader.toString();
  if (source.includes('csoMap')) return ({ locations, impactEnabled, impactSelectedId }) => <div data-testid="map" data-impact={String(impactEnabled)} data-route={impactSelectedId}>{locations.length}</div>;
  if (source.includes('waterQualityAssessmentChart')) return ({ assessment }) => <div data-testid="assessment-chart">{assessment.history.points.length}</div>;
  return ({ data }) => <div data-testid="density-chart">{data.length}</div>;
});
jest.mock('../components/functional/vomitfactor', () => ({ assessment }) => <div data-testid="indicator">{assessment?.level ?? 'none'}</div>);
jest.mock('../components/functional/csoCatchmentMonitoring', () => () => <div data-testid="catchment" />);
jest.mock('../components/functional/csoEventHistory', () => ({ onShowOnMap, onShowRoute }) => (
  <><button type="button" data-testid="history" onClick={() => onShowOnMap('A')}>history</button>
    <button type="button" onClick={() => onShowRoute('severn-trent:storm-overflow-activity:A')}>history route</button></>));

const LEGACY_ASSESSMENT = { source: 'legacy', version: 'sewage-map-density/2026-08-31', current: { level: 'lower', label: 'Lower', observedAt: '2026-08-31T12:00:00Z', reasons: [] }, history: null };
const RDP_ASSESSMENT = {
  source: 'rdp', version: 'hpp-upstream-activity/v1',
  current: { level: 'elevated', label: 'Elevated', observedAt: '2026-11-16T18:17:52Z', reasons: ['32 of 592 …'] },
  history: { stepMinutes: 60, hours: 120, points: [{ at: '2026-11-16T18:00:00Z' }, { at: '2026-11-16T18:17:52Z' }] },
  method: { version: 'hpp-upstream-activity/v1', recentHours: 48, bands: { elevated: { spillingNow: 3, recent: 15 }, high: { spillingNow: 10, recent: 60 } },
    runoff: { elevatedRiseMetres: 0.1, highRiseMetres: 0.3 } },
  explanation: { doesNotMean: 'It is not a measurement of bacteria.' },
  evidence: { membership: { members: 592 } },
  health: { state: 'fresh', source: 'river-data-platform-wq-assessment' },
};
const SUMMARY = { waterQualityData: { ScrapeTimestamp: '2026-08-31T12:00:00Z', statusSummary: { currentlySpilling: 1, recentlyStopped48h: 2, offline: 1, unknown: 1 }, locations: [{ id: 'A' }], health: { state: 'fresh' } } };

function mockFetches(assessment, summary = SUMMARY) {
  useFetch.mockImplementation((path) => ({
    data: path === '/api/waterquality' ? summary
      : path?.startsWith('/api/waterquality/assessment') ? assessment
        : path?.startsWith('/api/waterquality/csodensity') ? [{ timestamp: '2026-08-31T12:00:00Z', numberCSOsPerKm2: 0.01 }]
          : undefined,
    error: undefined,
    isPending: false,
  }));
}

describe('WaterQualityPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches each resource once and shares the result with its sections (legacy assessment)', () => {
    mockFetches(LEGACY_ASSESSMENT);
    render(<WaterQualityPage />);
    expect(screen.getByTestId('map')).toHaveTextContent('1');
    expect(screen.getByTestId('density-chart')).toHaveTextContent('1');
    expect(screen.getByTestId('indicator')).toHaveTextContent('lower');
    expect(screen.getByText('Currently spilling').previousSibling).toHaveTextContent('1');
    expect(screen.queryByText(/HPP paddling guidance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fresh monitors/i)).not.toBeInTheDocument();
    expect(screen.getByText(/contents may still be travelling downstream/i)).toBeInTheDocument();
    // The river context and the downstream impact overlay are both off (null) until a visitor asks for them. The browser
    // no longer reads /api/levels for the indication: the server's assessment carries it.
    expect(useFetch.mock.calls.map(([path]) => path)).toEqual([null, null, '/api/waterquality', '/api/waterquality/assessment?hours=120', '/api/waterquality/csodensity?hours=120']);
    fireEvent.change(screen.getByLabelText('Explore the river at Holme Pierrepont'), { target: { value: 'downstream' } });
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/river?direction=downstream', expect.objectContaining({ shouldRetryOnError: false }));
    fireEvent.click(screen.getByLabelText('Reported downstream spill impact'));
    // Refreshed on RDP's 5-minute interval so routes follow source events; no retry storm and no focus refetch.
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/river/impact',
      expect.objectContaining({ refreshInterval: 300000, shouldRetryOnError: false, revalidateOnFocus: false }));
    expect(screen.getByTestId('catchment')).toBeInTheDocument();
    expect(screen.getByText(/CSO bands are relative to the previous year/)).toBeInTheDocument();
  });

  it('shows the RDP assessment history and never reads the Sewage Map density unless the archive is opened', () => {
    mockFetches(RDP_ASSESSMENT);
    render(<WaterQualityPage />);
    expect(screen.getByTestId('indicator')).toHaveTextContent('elevated');
    expect(screen.getByTestId('assessment-chart')).toHaveTextContent('2');
    expect(screen.queryByTestId('density-chart')).not.toBeInTheDocument();
    expect(useFetch.mock.calls.every(([path]) => !path?.startsWith('/api/waterquality/csodensity'))).toBe(true);
    // Explains what the indication is and is not, with its version and thresholds.
    expect(screen.getByText(/Version hpp-upstream-activity\/v1/)).toBeInTheDocument();
    expect(screen.getByText(/What it does not mean/).parentElement).toHaveTextContent(/It is not a measurement of bacteria/);
    expect(screen.getByText(/never counted as "no spill"/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Show the archived Sewage Map density (previous method)'));
    // The archive is a separate, labelled chart on its own scale.
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/csodensity?hours=720&interval=60', expect.anything());
    expect(screen.getByTestId('wq-archive')).toHaveTextContent(/scale and reference levels differ/);
    expect(screen.getByTestId('density-chart')).toBeInTheDocument();
    expect(screen.getByTestId('assessment-chart')).toBeInTheDocument();
  });

  it('counts fresh not-spilling reports separately from unavailable status, without calling them clear (#114)', () => {
    const locations = [
      { id: 'A', status: 'active', statusReason: 'spilling' },
      { id: 'B', status: 'offline', statusReason: 'offline' },
      { id: 'C', status: 'unknown', statusReason: 'stale' },
      ...['D', 'E', 'F'].map((id) => ({ id, status: 'unknown', statusReason: 'not_spilling_no_recent_event' })),
    ];
    mockFetches(LEGACY_ASSESSMENT, { waterQualityData: { statusSummary: { currentlySpilling: 1, recentlyStopped48h: 0, offline: 1, unknown: 4 }, locations, health: { state: 'fresh' } } });
    render(<WaterQualityPage />);
    expect(screen.getByText('Status unavailable').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('3 other upstream locations: not spilling, no spill in the last 48 hours.')).toBeInTheDocument();
  });

  it('reports current CSO status as unavailable instead of showing zero spills when RDP has no usable status', () => {
    mockFetches(RDP_ASSESSMENT, { waterQualityData: { ScrapeTimestamp: '2026-08-31T12:00:00Z',
      statusSummary: { currentlySpilling: null, recentlyStopped48h: null, offline: null, unknown: 2 },
      locations: [{ id: 'A', status: 'unknown', statusReason: 'rdp_unavailable' }, { id: 'B', status: 'unknown', statusReason: 'rdp_unavailable' }],
      health: { state: 'unavailable', cso: { origin: 'rdp', available: false } } } });
    render(<WaterQualityPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/Current CSO status is temporarily unavailable/);
    expect(screen.queryByText('Currently spilling')).not.toBeInTheDocument();
    expect(screen.queryByText('Stopped in 48 hours')).not.toBeInTheDocument();
  });

  it('reports status as unavailable, not as zero spills, when no RDP report is up to date', () => {
    const locations = ['A', 'B'].map((id) => ({ id, status: 'unknown', statusReason: 'stale' }));
    mockFetches(RDP_ASSESSMENT, { waterQualityData: { statusSummary: { currentlySpilling: 0, recentlyStopped48h: 0, offline: 0, unknown: 2 }, locations,
      health: { state: 'fresh', cso: { origin: 'rdp', available: true, read: { retrievedAt: '2026-11-16T18:15:00Z' } } } } });
    render(<WaterQualityPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/temporarily unavailable: no upstream outfall has an up-to-date report/);
    expect(screen.queryByText('Currently spilling')).not.toBeInTheDocument();
  });

  it('shows when the status was read, and a route chosen in the spill history switches the overlay on and selects it', () => {
    mockFetches(RDP_ASSESSMENT, { waterQualityData: { statusSummary: { currentlySpilling: 1, recentlyStopped48h: 0, offline: 0, unknown: 0 },
      locations: [{ id: 'A', status: 'active', statusReason: 'spilling' }],
      health: { state: 'fresh', cso: { origin: 'rdp', available: true, read: { retrievedAt: '2026-11-16T18:15:00Z' } } } } });
    render(<WaterQualityPage />);
    expect(screen.getByText(/Status as of/)).toBeInTheDocument();
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality', expect.objectContaining({ refreshInterval: 300000 }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-impact', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'history route' }));
    expect(screen.getByTestId('map')).toHaveAttribute('data-impact', 'true');
    expect(screen.getByTestId('map')).toHaveAttribute('data-route', 'severn-trent:storm-overflow-activity:A');
    expect(screen.getByLabelText('Reported downstream spill impact')).toBeChecked();
  });
});
