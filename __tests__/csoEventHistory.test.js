import { fireEvent, render, screen, within } from '@testing-library/react';
import CsoEventHistory, { evidenceMessages, formatMinutes, pageSummary } from '../components/functional/csoEventHistory';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');

const EVENT = (id, overrides = {}) => ({
  eventId: `cse_${id.repeat(24)}`, outfallId: 'SVT1', assetId: 'severn-trent:storm-overflow-activity:SVT1',
  startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T08:00:00.000Z', endNoLaterThan: null, lifecycle: 'completed',
  display: 'completed', boundaryProvenance: 'provider_reported', durationMinutes: 120, elapsedMinutes: null, maxDurationMinutes: null,
  startedBeforeWindow: false, revision: 1, corrected: false, underReview: false, heldClaims: 0, tier: 'hot', ...overrides,
});
const outfall = (id, overrides = {}) => ({ id, assetId: `severn-trent:storm-overflow-activity:${id}`, provider: 'severn-trent',
  providerLabel: 'Severn Trent Water', receivingWatercourse: `River ${id}`, name: null, coordinates: { x: -1.1, y: 52.9 }, state: 'read',
  coverage: { gaps: [], collectedFraction: 1 }, truncated: false, ...overrides });
const evidence = (overrides = {}) => ({ conclusion: 'events', outfalls: { members: 2, monitored: 2, read: 2, failed: 0, notRead: 0, notMonitored: 0, unmapped: 0 },
  coverage: { collectedFraction: 1, collectedHours: 24, gapCount: 0, reportingCompleteness: 'unverified', sufficient: true }, truncated: false, complete: true, ...overrides });
const history = (overrides = {}) => ({ enabled: true, state: 'available', window: { key: '48h', hours: 48 }, outfalls: [outfall('SVT1'), outfall('SVT2')],
  events: [
    EVENT('a', { display: 'ongoing', lifecycle: 'ongoing', endedAt: null, durationMinutes: null, elapsedMinutes: 95 }),
    EVENT('b', { display: 'unresolved', lifecycle: 'unresolved', endedAt: null, durationMinutes: null, endNoLaterThan: '2026-11-12T05:00:00.000Z', maxDurationMinutes: 60, outfallId: 'SVT2' }),
    EVENT('c', { revision: 2, startedBeforeWindow: true }),
  ],
  evidence: evidence(), ...overrides });

const detail = {
  event: EVENT('c', { revision: 2, corrected: true }),
  outfall: outfall('SVT1'),
  currentRevision: { revision: 2, changeReason: 'end_corrected', changeLabel: 'End time corrected' },
  openHolds: [{ fetchedAt: '2026-11-12T09:30:00.000Z', reason: 'PrecedesLatestEvent' }],
  revisions: [
    { revision: 1, changeLabel: 'End reported by provider', recordedAt: '2026-11-12T07:05:00.000Z', sourceFetchedAt: '2026-11-12T07:04:00.000Z', reconciliation: 'automatic',
      current: { startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T07:00:00.000Z', status: 'completed' }, previous: null, changed: [], correction: false },
    { revision: 2, changeLabel: 'End time corrected', recordedAt: '2026-11-12T08:05:00.000Z', sourceFetchedAt: '2026-11-12T08:04:00.000Z', reconciliation: 'automatic',
      current: { startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T08:00:00.000Z', status: 'completed' },
      previous: { startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T07:00:00.000Z', status: 'completed' }, changed: ['endedAt'], correction: true },
  ],
  revisionsTruncated: false,
  attribution: { providerLabel: 'Severn Trent Water', method: 'live_reconstruction' },
};

function mockFetch(list, eventDetail = { data: detail }) {
  useFetch.mockImplementation((path) => (path?.startsWith('/api/waterquality/cso/events/')
    ? { data: undefined, error: undefined, isPending: false, ...eventDetail }
    : { data: undefined, error: undefined, isPending: false, ...list }));
}

describe('CsoEventHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing while the feature is disabled', () => {
    mockFetch({ data: { enabled: false } });
    const { container } = render(<CsoEventHistory />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows active, unresolved and corrected events distinctly without inventing an end', () => {
    mockFetch({ data: history() });
    render(<CsoEventHistory />);
    const items = within(screen.getByRole('list', { name: /Recorded spills, 3 shown/ })).getAllByRole('listitem');
    expect(within(items[0]).getByText('Ongoing')).toBeInTheDocument();
    expect(within(items[0]).getByText(/1 hr 35 min so far/)).toBeInTheDocument();
    expect(within(items[0]).queryByText(/ended/)).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Unresolved')).toBeInTheDocument();
    expect(within(items[1]).getByText(/Uncertain; at most 1 hr 0 min/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/revision 2/)).toBeInTheDocument();
    expect(within(items[2]).queryByText('Corrected')).not.toBeInTheDocument();
    expect(within(items[2]).getByText('Started before this period')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '48 hours' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens one event with its corrections, attribution and a map link', () => {
    mockFetch({ data: history() });
    const onShowOnMap = jest.fn();
    const onShowRoute = jest.fn();
    render(<CsoEventHistory onShowOnMap={onShowOnMap} onShowRoute={onShowRoute} />);
    const toggle = screen.getAllByRole('button', { expanded: false })[2];
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(useFetch).toHaveBeenCalledWith(`/api/waterquality/cso/events/cse_${'c'.repeat(24)}`, expect.any(Object));
    expect(screen.getByText('Revision 2: End time corrected')).toBeInTheDocument();
    expect(screen.getByText('Correction')).toBeInTheDocument();
    expect(screen.getByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText('Before:')).toBeInTheDocument();
    expect(screen.getByText(/reconstructed from live provider status checks/)).toBeInTheDocument();
    expect(screen.getByText(/1 conflicting provider report is awaiting review/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show outfall on map' }));
    expect(onShowOnMap).toHaveBeenCalledWith('SVT1');
    // The downstream route is chosen by the outfall's canonical asset ID, the key the impact overlay uses.
    fireEvent.click(screen.getByRole('button', { name: 'Show downstream route' }));
    expect(onShowRoute).toHaveBeenCalledWith('severn-trent:storm-overflow-activity:SVT1');
  });

  it('keeps the list when revision history is unavailable', () => {
    mockFetch({ data: history() }, { error: new Error('503') });
    render(<CsoEventHistory />);
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]);
    expect(screen.getByText(/Revision history is unavailable right now/)).toBeInTheDocument();
    expect(screen.getByText('No end reported yet: still ongoing')).toBeInTheDocument();
  });

  it('filters by the selected outfall and switches window', () => {
    mockFetch({ data: history() });
    const onSelectOutfall = jest.fn();
    const { rerender } = render(<CsoEventHistory selectedOutfallId="SVT2" onSelectOutfall={onSelectOutfall} />);
    expect(screen.getByRole('list', { name: /1 shown/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Outfall'), { target: { value: '' } });
    expect(onSelectOutfall).toHaveBeenCalledWith('');
    rerender(<CsoEventHistory selectedOutfallId="" onSelectOutfall={onSelectOutfall} />);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/cso/events?window=7d', expect.any(Object));
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/cso/events?window=48h&outfall=SVT2', expect.any(Object));
  });

  it('lists only outfalls with events for a large RDP membership, leaving provenance to the About section', () => {
    const many = Array.from({ length: 30 }, (_, i) => outfall(`Q${i}`, { eventCount: 0 }));
    mockFetch({ data: history({ outfalls: [outfall('SVT1', { eventCount: 2 }), outfall('SVT2', { eventCount: 1 }), ...many],
      membership: { source: 'rdp', state: 'available', relationshipSet: 'hpp-upstream-outfalls', version: 'bb422e98d78ee1bc', scopes: [{ name: 'confirmed', count: 592 }] } }) });
    render(<CsoEventHistory />);
    const select = screen.getByLabelText('Outfall');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['All monitored outfalls', 'River SVT1 (SVT1) (2)', 'River SVT2 (SVT2) (1)']);
    expect(screen.queryByText(/hpp-upstream-outfalls/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Source:/)).not.toBeInTheDocument();
  });

  it('says the service is unavailable rather than showing an empty history', () => {
    mockFetch({ data: history({ state: 'unavailable', events: [], evidence: evidence({ conclusion: 'unavailable' }) }) });
    render(<CsoEventHistory />);
    expect(screen.getByText(/Spill history is temporarily unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/No reported events/)).not.toBeInTheDocument();
    mockFetch({ error: new Error('500') });
    render(<CsoEventHistory />);
    expect(screen.getAllByText(/Spill history is temporarily unavailable/)).toHaveLength(2);
  });
});

describe('evidenceMessages', () => {
  const texts = (value) => evidenceMessages(value).map((message) => message.text).join(' | ');

  it('never presents an empty list as proof of no spills', () => {
    const text = texts(history({ events: [], evidence: evidence({ conclusion: 'no_reported_events' }) }));
    expect(text).toMatch(/No reported events in the available data for the last 48 hours/);
    expect(text).toMatch(/not proof that no spills occurred/);
  });

  it('explains incomplete, truncated, failed and unmonitored coverage', () => {
    const text = texts(history({ window: { key: '30d', hours: 720 }, events: [], evidence: evidence({ conclusion: 'coverage_incomplete', truncated: true,
      outfalls: { members: 5, monitored: 3, read: 2, failed: 1, notRead: 0, notMonitored: 1, unmapped: 1 },
      coverage: { collectedFraction: 0.42, gapCount: 3, sufficient: false } }) }));
    expect(text).toMatch(/monitoring coverage is incomplete, so spills may have gone unrecorded/);
    expect(text).toMatch(/about 42% of this period was collected \(3 gaps\)/);
    expect(text).toMatch(/does not yet cover enough of the last 30 days/);
    expect(text).toMatch(/could not be loaded for 1 outfall;/);
    // RDP pages each outfall oldest first, so a truncated read is missing the newest events, never the oldest.
    expect(text).toMatch(/Some outfalls had more events in this period than can be read at once, so their most recent events are missing/);
    expect(text).toMatch(/2 of 5 upstream outfalls have event history; the other 2 are not monitored/);
  });

  it('reports outfalls that were not read separately from unmonitored ones (#114)', () => {
    const counts = { members: 50, monitored: 50, read: 40, failed: 0, notRead: 10, notMonitored: 0, unmapped: 0 };
    const text = texts(history({ window: { key: '30d', hours: 720 }, readPolicy: { limit: 40, prioritisedBy: 'events_last_7d' },
      evidence: evidence({ outfalls: counts }) }));
    expect(text).toMatch(/read for 40 of 50 upstream outfalls, those with spills in the last 7 days first\. The other 10 were not read/);
    expect(text).not.toMatch(/not monitored for events yet/);
  });

  it('formats long durations compactly', () => {
    expect(formatMinutes(3000)).toBe('2 d 2 hr');
    expect(formatMinutes(45)).toBe('45 min');
  });
});

describe('CsoEventHistory pagination', () => {
  const page = (overrides = {}) => ({ size: 50, offset: 0, returned: 3, total: 120, totalIsLowerBound: false, hasNewer: false, hasOlder: true,
    nextCursor: 'cursor-1', newerSinceStart: 0, windowMoved: false, ...overrides });
  const older = history({ events: [EVENT('d'), EVENT('e', { outfallId: 'SVT2' })], page: page({ offset: 50, returned: 2, hasNewer: true, nextCursor: 'cursor-2' }) });

  // Responses keyed by request path; anything else is still loading.
  function mockPaths(responses) {
    useFetch.mockImplementation((path) => {
      if (path?.startsWith('/api/waterquality/cso/events/')) return { data: detail, error: undefined, isPending: false };
      return { data: undefined, error: undefined, isPending: path !== null, mutate: jest.fn(), ...responses[path] };
    });
  }

  beforeEach(() => jest.clearAllMocks());

  it('walks to older and back to newer events through server cursors', () => {
    mockPaths({ '/api/waterquality/cso/events?window=48h': { data: history({ page: page() }) },
      '/api/waterquality/cso/events?window=48h&cursor=cursor-1': { data: older } });
    const onShowRoute = jest.fn();
    render(<CsoEventHistory onShowRoute={onShowRoute} />);
    expect(screen.getByText(/^Events 1–3 of 120/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Newer events' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Older events' }));
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/cso/events?window=48h&cursor=cursor-1', expect.objectContaining({ revalidateOnFocus: false }));
    expect(screen.getByRole('list', { name: 'Recorded spills, Events 51–52 of 120' })).toHaveFocus();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([expect.stringContaining('River SVT1'), expect.stringContaining('River SVT2')]);
    // Event details and the downstream route still work on an older page.
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Show downstream route' }));
    expect(onShowRoute).toHaveBeenCalledWith('severn-trent:storm-overflow-activity:SVT1');
    fireEvent.click(screen.getByRole('button', { name: 'Newer events' }));
    expect(screen.getByText(/^Events 1–3 of 120/)).toBeInTheDocument();
  });

  it('restarts at the newest events when the period or outfall changes', () => {
    mockPaths({ '/api/waterquality/cso/events?window=48h': { data: history({ page: page() }) },
      '/api/waterquality/cso/events?window=48h&cursor=cursor-1': { data: older },
      '/api/waterquality/cso/events?window=7d': { data: history({ window: { key: '7d', hours: 168 }, page: page({ total: 300 }) }) },
      '/api/waterquality/cso/events?window=7d&outfall=SVT2': { data: history({ window: { key: '7d', hours: 168 }, events: [EVENT('f', { outfallId: 'SVT2' })], page: page({ returned: 1, total: 1, hasOlder: false, nextCursor: null }) }) } });
    const { rerender } = render(<CsoEventHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Older events' }));
    expect(screen.getByText(/^Events 51–52 of 120/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByText(/^Events 1–3 of 300/)).toBeInTheDocument();
    expect(useFetch).not.toHaveBeenCalledWith(expect.stringContaining('window=7d&cursor'), expect.anything());
    rerender(<CsoEventHistory selectedOutfallId="SVT2" />);
    expect(useFetch).toHaveBeenLastCalledWith('/api/waterquality/cso/events?window=7d&outfall=SVT2', expect.any(Object));
    expect(screen.getByText(/^Events 1–1 of 1/)).toBeInTheDocument();
    expect(screen.getByText(/End of the recorded events for this period./)).toBeInTheDocument();
  });

  it('shows exhaustion with a limitation instead of a complete-looking total', () => {
    mockPaths({ '/api/waterquality/cso/events?window=48h': { data: history({ page: page({ totalIsLowerBound: true, hasOlder: false, nextCursor: null, total: 3 }) }) } });
    render(<CsoEventHistory />);
    expect(screen.getByText(/Events 1–3 of 3 or more/)).toBeInTheDocument();
    expect(screen.getByText(/End of the events that could be read for this period\. Some outfall history was not fully read/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Older events' })).not.toBeInTheDocument();
  });

  it.each([
    [409, /changed while you were browsing/, false],
    [410, /has expired/, false],
    [503, /could not be loaded right now/, true],
  ])('a %s continuation offers a way back, never an endless spinner', (status, message, retry) => {
    const error = Object.assign(new Error('x'), { status });
    mockPaths({ '/api/waterquality/cso/events?window=48h': { data: history({ page: page() }) },
      '/api/waterquality/cso/events?window=48h&cursor=cursor-1': { error } });
    render(<CsoEventHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Older events' }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Loading events…')).not.toBeInTheDocument();
    expect(Boolean(screen.queryByRole('button', { name: 'Try again' }))).toBe(retry);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the newest events' }));
    expect(screen.getByText(/^Events 1–3 of 120/)).toBeInTheDocument();
  });

  it('says when newer events arrived or the moving period advanced while browsing', () => {
    mockPaths({ '/api/waterquality/cso/events?window=48h': { data: history({ page: page() }) },
      '/api/waterquality/cso/events?window=48h&cursor=cursor-1': { data: { ...older, window: { key: '48h', hours: 48, from: '2026-11-10T12:30:00.000Z' },
        page: { ...older.page, newerSinceStart: 2, windowMoved: true } } } });
    render(<CsoEventHistory />);
    fireEvent.click(screen.getByRole('button', { name: 'Older events' }));
    expect(screen.getByText('2 newer events have been recorded since you started browsing.')).toBeInTheDocument();
    expect(screen.getByText(/The 48 hours period has moved on since you started browsing/)).toBeInTheDocument();
  });

  it('summarises a page', () => {
    expect(pageSummary(null)).toBeNull();
    expect(pageSummary(page({ returned: 0 }))).toBeNull();
    expect(pageSummary(page({ offset: 100, returned: 20, total: 120, hasOlder: false }))).toEqual({ range: 'Events 101–120 of 120', end: 'End of the recorded events for this period.' });
  });
});
