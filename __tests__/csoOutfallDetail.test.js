import { fireEvent, render, screen, within } from '@testing-library/react';
import CsoOutfallDetail from '../components/functional/csoOutfallDetail';
import useFetch from '../libs/useFetch';
import { outfallDetailPath, outfallMapPath, readOutfallMapQuery } from '../libs/csoOutfallLinks';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href, className }) => <a href={href} className={className}>{children}</a>);

const ASSET = 'severn-trent:storm-overflow-activity:SVT00001';
const EVENT = (c, overrides = {}) => ({
  eventId: `cse_${c.repeat(24)}`, assetId: ASSET, startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T08:00:00.000Z', endNoLaterThan: null,
  lifecycle: 'completed', display: 'completed', boundaryProvenance: 'provider_reported', durationMinutes: 120, elapsedMinutes: null, maxDurationMinutes: null,
  startedBeforeWindow: false, revision: 1, underReview: false, heldClaims: 0, tier: 'hot', ...overrides,
});
const evidence = (overrides = {}) => ({ conclusion: 'events', outfalls: { members: 1, monitored: 1, read: 1, failed: 0, notRead: 0, notMonitored: 0, unmapped: 0 },
  coverage: { collectedFraction: 1, collectedHours: 48, gapCount: 0, reportingCompleteness: 'unverified', sufficient: true }, truncated: false, complete: true, ...overrides });

function detail(overrides = {}) {
  return {
    id: ASSET,
    publicId: 'SVT00001',
    outfall: { assetId: ASSET, externalId: 'SVT00001', provider: 'severn-trent', providerLabel: 'Severn Trent Water', sourceId: 'storm-overflow-activity',
      name: 'Weir A', receivingWatercourse: 'River Trent', coordinates: { x: -1.15, y: 52.95 }, catalogueVersion: 'v1', selected: true, attribution: null },
    identity: { state: 'resolved' },
    coLocated: [
      { assetId: 'severn-trent:storm-overflow-activity:SVT00002', externalId: 'SVT00002', inScope: true, category: 'confirmed', receivingWatercourse: 'River Trent' },
      { assetId: 'severn-trent:storm-overflow-activity:SVT09999', externalId: 'SVT09999', inScope: false, category: null, receivingWatercourse: null },
    ],
    coLocatedTotal: 2,
    relationship: { basis: 'rdp', category: 'confirmed', primary: true, reason: 'BothMethodsNameAgrees', reviewed: false, routed: true,
      relationshipSet: 'hpp-upstream-outfalls', version: 'bb422e98d78ee1bc5923', approval: 'approved' },
    status: { enabled: true, source: 'rdp', state: 'available',
      location: { status: 'recent', statusReason: 'recently_stopped', latestEventStart: '2026-11-12T06:00:00.000Z', latestEventEnd: '2026-11-12T08:00:00.000Z',
        eventDurationMinutes: 120, observedAt: '2026-11-12T11:52:00.000Z', sourceUpdatedAt: '2026-11-12T11:50:00.000Z' },
      report: { sourceAgeSeconds: 600 } },
    history: { enabled: true, state: 'available', window: { key: '48h', hours: 48 }, outfall: { state: 'read', truncated: false },
      events: [
        EVENT('a', { display: 'ongoing', lifecycle: 'ongoing', endedAt: null, durationMinutes: null, elapsedMinutes: 95 }),
        EVENT('b', { display: 'unresolved', lifecycle: 'unresolved', endedAt: null, durationMinutes: null, endNoLaterThan: '2026-11-12T05:00:00.000Z', maxDurationMinutes: 60 }),
        EVENT('c', { revision: 3 }),
      ],
      evidence: evidence() },
    connectivity: { impactEnabled: true, routed: true },
    ...overrides,
  };
}

const revisions = {
  event: EVENT('c', { revision: 3, corrected: true }), outfall: null, openHolds: [], revisionsTruncated: false,
  attribution: { method: 'live_reconstruction' },
  revisions: [{ revision: 3, changeLabel: 'End time corrected', correction: true, recordedAt: '2026-11-12T09:00:00.000Z', sourceFetchedAt: '2026-11-12T09:00:00.000Z',
    current: { startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T08:00:00.000Z', status: 'completed' },
    previous: { startedAt: '2026-11-12T06:00:00.000Z', endedAt: '2026-11-12T07:00:00.000Z', status: 'completed' }, changed: ['endedAt'] }],
};

function mockFetch(main, eventDetail = { data: revisions }) {
  useFetch.mockImplementation((path) => (path?.startsWith('/api/waterquality/cso/events/')
    ? { data: undefined, error: undefined, isPending: false, ...eventDetail }
    : { data: undefined, error: undefined, isPending: false, ...main }));
}

describe('outfall links', () => {
  test('use the canonical id, readable and stable, never coordinates', () => {
    expect(outfallDetailPath(ASSET)).toBe('/waterquality/cso/severn-trent:storm-overflow-activity:SVT00001');
    expect(outfallDetailPath('a/b c')).toBe('/waterquality/cso/a%2Fb%20c');
    expect(outfallMapPath({ publicId: 'SVT00001' })).toBe('/waterquality?outfall=SVT00001#cso-map-panel');
    expect(outfallMapPath({ publicId: 'SVT00001', assetId: ASSET, route: true }))
      .toBe(`/waterquality?outfall=SVT00001&route=${ASSET}#cso-map-panel`);
    expect(readOutfallMapQuery(`?outfall=SVT00001&route=${ASSET}`)).toEqual({ outfall: 'SVT00001', route: ASSET });
    expect(readOutfallMapQuery('?outfall=<script>')).toEqual({ outfall: null, route: null });
  });
});

describe('CsoOutfallDetail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows identity, published location, status with source age, membership and recorded events together', () => {
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(useFetch).toHaveBeenCalledWith(`/api/waterquality/cso/outfalls/${encodeURIComponent(ASSET)}?window=48h`, expect.objectContaining({ keepPreviousData: true }));
    expect(screen.getByRole('heading', { level: 1, name: 'Weir A' })).toBeInTheDocument();
    expect(screen.getByText(ASSET)).toBeInTheDocument();
    expect(screen.getByText('52.95000, -1.15000', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Spill stopped in the last 48 hours')).toBeInTheDocument();
    expect(screen.getByText(/10 min old/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed upstream of HPP/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show on the water-quality map' })).toHaveAttribute('href', '/waterquality?outfall=SVT00001#cso-map-panel');
    const list = screen.getByRole('list', { name: 'Recorded spills for this outfall' });
    expect(within(list).getByText('Ongoing')).toBeInTheDocument();
    expect(within(list).getByText('Unresolved')).toBeInTheDocument();
    expect(within(list).getByText(/Uncertain; at most 1 hr/)).toBeInTheDocument();
    expect(within(list).getByText(/revised \(revision 3\)/)).toBeInTheDocument();
  });

  test('co-located monitors are listed separately; only in-scope ones link to their own detail', () => {
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id={ASSET} />);
    const box = screen.getByTestId('co-located');
    expect(within(box).getByText(/2 other outfalls share this published location/)).toBeInTheDocument();
    expect(within(box).getByRole('link', { name: 'SVT00002' })).toHaveAttribute('href', '/waterquality/cso/severn-trent:storm-overflow-activity:SVT00002');
    expect(within(box).queryByRole('link', { name: 'SVT09999' })).not.toBeInTheDocument();
    expect(within(box).getByText(/outside the HPP upstream list/)).toBeInTheDocument();
  });

  test('a corrected event opens with its revision history and no self-link', () => {
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id={ASSET} />);
    fireEvent.click(screen.getAllByRole('button', { expanded: false }).at(-1));
    expect(useFetch).toHaveBeenCalledWith(`/api/waterquality/cso/events/cse_${'c'.repeat(24)}`, expect.anything());
    expect(screen.getByText('Revision 3: End time corrected')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Outfall details' })).not.toBeInTheDocument();
  });

  test.each([
    ['stale', 'The latest report is out of date'],
    ['not_spilling_no_recent_event', 'with no reported spill in the last 48 hours'],
    ['status_not_read', 'The current report could not be read'],
  ])('an unknown status (%s) is never shown as clear', (statusReason, text) => {
    mockFetch({ data: detail({ status: { enabled: true, source: 'rdp', state: 'available', report: null,
      location: { status: 'unknown', statusReason, observedAt: null, sourceUpdatedAt: null } } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByTestId('outfall-status')).toHaveTextContent('Status unknown');
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByText(/^Not spilling$/)).not.toBeInTheDocument();
  });

  test('an unavailable status says so and claims neither spilling nor clear', () => {
    mockFetch({ data: detail({ status: { enabled: true, source: 'rdp', state: 'unavailable', errorCode: 'TIMEOUT' } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/Current status is unavailable right now. This outfall is not shown as spilling or as clear/)).toBeInTheDocument();
  });

  test('an inferred candidate is labelled outside the confirmed membership with an unconfirmed route', () => {
    mockFetch({ data: detail({ relationship: { ...detail().relationship, category: 'candidate', primary: false } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText('Not confirmed upstream')).toBeInTheDocument();
    expect(screen.getByText(/Not on the confirmed upstream list/)).toBeInTheDocument();
    expect(screen.getByText(/possible link to the river network, but it is not confirmed/)).toBeInTheDocument();
  });

  test('links to the existing map overlay for its route, with the connectivity-only caveat', () => {
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByRole('link', { name: 'Show downstream route on the map' }))
      .toHaveAttribute('href', `/waterquality?outfall=SVT00001&route=${ASSET}#cso-map-panel`);
    expect(screen.getByText(/connection only, not pollution levels, travel time or whether the water is safe/)).toBeInTheDocument();
  });

  test('an unrouted outfall offers no route; route display off is shown as unavailable', () => {
    mockFetch({ data: detail({ connectivity: { impactEnabled: false, routed: false }, relationship: { ...detail().relationship, routed: false } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/^Not linked to the river network\.$/)).toBeInTheDocument();
    expect(screen.getByText(/downstream route map is not available on this site/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Show downstream route on the map' })).not.toBeInTheDocument();
  });

  test('history flag off and history read failure are section-level, the rest still renders', () => {
    mockFetch({ data: detail({ history: { enabled: false } }) });
    const { unmount } = render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/Recorded spill history is not available on this site/)).toBeInTheDocument();
    expect(screen.getByText('Spill stopped in the last 48 hours')).toBeInTheDocument();
    unmount();
    mockFetch({ data: detail({ history: { enabled: true, state: 'unavailable', window: { key: '48h' }, events: [] } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/Recorded spills are temporarily unavailable/)).toBeInTheDocument();
  });

  test('an empty or unmonitored history is never presented as proof of no spills', () => {
    mockFetch({ data: detail({ history: { ...detail().history, events: [], evidence: evidence({ conclusion: 'no_reported_events' }) } }) });
    const { unmount } = render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/No reported spills in the last/)).toBeInTheDocument();
    unmount();
    mockFetch({ data: detail({ history: { ...detail().history, outfall: { state: 'not_monitored' }, events: [], evidence: evidence({ conclusion: 'not_monitored' }) } }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByText(/not monitored for event history yet/)).toBeInTheDocument();
  });

  test('changing the period re-reads the same outfall', () => {
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id={ASSET} />);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(useFetch).toHaveBeenLastCalledWith(expect.stringMatching(/\?window=30d$/), expect.anything());
  });

  test('an old provider-id link is replaced by the canonical address', () => {
    const replace = jest.spyOn(window.history, 'replaceState');
    mockFetch({ data: detail() });
    render(<CsoOutfallDetail id="SVT00001" />);
    expect(replace).toHaveBeenCalledWith(null, '', `/waterquality/cso/${ASSET}`);
    replace.mockRestore();
  });

  test('an unknown or invalid outfall shows not found; other failures show an error', () => {
    const notFound = Object.assign(new Error('Outfall not found'), { status: 404 });
    mockFetch({ error: notFound });
    const { unmount } = render(<CsoOutfallDetail id="bad id!" />);
    expect(screen.getByRole('heading', { name: 'Outfall not found' })).toBeInTheDocument();
    unmount();
    mockFetch({ error: Object.assign(new Error('down'), { status: 503 }) });
    render(<CsoOutfallDetail id={ASSET} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Outfall details are unavailable right now');
  });

  test('legacy-only configuration: identity without a platform ID still renders', () => {
    mockFetch({ data: detail({ id: 'SVT00001', outfall: { ...detail().outfall, assetId: null, name: null, selected: null }, identity: { state: 'not_read' }, coLocated: null,
      relationship: { basis: 'legacy', category: 'legacy', primary: true, routed: null }, history: { enabled: false }, connectivity: { impactEnabled: false, routed: null },
      status: { ...detail().status, source: 'legacy' } }) });
    render(<CsoOutfallDetail id="SVT00001" />);
    expect(screen.getByRole('heading', { level: 1, name: 'River Trent storm overflow' })).toBeInTheDocument();
    expect(screen.getByText('Not resolved')).toBeInTheDocument();
    expect(screen.getByText(/upstream list from the Sewage Map/)).toBeInTheDocument();
    expect(screen.getByText(/Not yet assessed against the River Tracer network/)).toBeInTheDocument();
  });
});
