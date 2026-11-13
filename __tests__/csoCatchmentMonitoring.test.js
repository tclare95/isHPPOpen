import { fireEvent, render, screen, within } from '@testing-library/react';
import CsoCatchmentMonitoring, { formatAge, readMessages } from '../components/functional/csoCatchmentMonitoring';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');

const states = { active: 3, recent: 2, not_spilling: 1400, offline: 10, stale: 40, unresolved: 9, no_observations: 20, unavailable: 0, not_read: 30 };
const location = (outfalls, locations, withoutLocation = 0) => ({ outfalls, locations, withoutLocation, sharedLocations: 0, outfallsAtSharedLocations: 0 });
const data = (overrides = {}) => ({
  enabled: true,
  state: 'partial',
  set: { key: 'hpp-catchment', label: 'River Trent catchment upstream of Holme Pierrepont', providerLabel: 'Severn Trent Water', expectedOutfalls: 1514,
    relationshipSet: 'hpp-upstream-outfalls', relationshipVersion: 'bb422e98d78ee1bc' },
  selection: { reportedTotal: 1514, matchesReviewed: true, catalogueMembers: 1514, notInCatalogue: 0 },
  window: { hours: 48, from: '2026-11-10T11:59:00Z', to: '2026-11-12T11:59:00Z', retrievedAt: '2026-11-12T11:59:00Z' },
  read: { complete: false, pages: 15, received: 1484, missing: 30, partialPages: 0, duplicates: 0, restarted: false, stopReason: 'page_failed',
    errorCode: 'TIMEOUT', catalogueError: null },
  summary: {
    total: 1514, read: 1484, states, freshReports: 1405, unknown: 109,
    locations: { all: { ...location(1484, 1390, 4), sharedLocations: 60, outfallsAtSharedLocations: 150 }, active: location(3, 2), recent: location(2, 2),
      withEvents: location(12, 11) },
    events: { outfallsWithEvents: 12, events: 15, ongoing: 3, unresolvedEnd: 4, underReview: 0, truncatedOutfalls: 0 },
    coverage: { collectedThroughout: 0, partlyCollected: 1400, notCollected: 84, noCoverageReported: 0, gapCount: 1484, awaitingNextCheck: 0,
      meanCollectedFraction: 0.4, earliestCollectedFrom: '2026-11-12T16:41:00Z', reportingCompleteness: 'unverified' },
    lag: { sourceAgeSeconds: { median: 420, p90: 900, max: 7200, samples: 1400 }, readAgeSeconds: 120 },
  },
  highlights: { outfalls: [{ assetId: 'severn-trent:storm-overflow-activity:SVT1', externalId: 'SVT1', name: null, receivingWatercourse: 'River Leen',
    state: 'active', latestEventStart: '2026-11-12T10:00:00Z', latestEventEnd: null, sharesLocationWith: 1 }], truncated: false },
  comparison: {
    state: 'available', observations: 1, rdpCollectedObservations: 1, interchangeable: false,
    legacyThresholds: { elevated: 0.0105, high: 0.0258 },
    memberAgreement: { bothSpilling: 1, legacyOnly: 0, rdpOnly: 2, neither: 3, rdpUncertain: 0, notComparable: 4 },
    rows: [{ observedAt: '2026-11-12T11:00:00.000Z', legacy: { numberCSOsPerKm2: 0.0123, numberUpstreamCSOs: 4 },
      members: { listed: 5, reporting: 5, spilling: 1 }, rdp: { collectedOutfalls: 1450, spillingOutfalls: { lower: 3, upper: 5 }, spillingLocations: 2 } }],
  },
  attribution: 'Severn Trent Water storm overflow activity',
  ...overrides,
});

describe('CsoCatchmentMonitoring', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders nothing while the flag is off', () => {
    useFetch.mockReturnValue({ data: { enabled: false }, error: undefined, isPending: false });
    const { container } = render(<CsoCatchmentMonitoring />);
    expect(container).toBeEmptyDOMElement();
    expect(useFetch).toHaveBeenCalledWith('/api/waterquality/cso/catchment', expect.objectContaining({ shouldRetryOnError: false }));
  });

  test('makes monitored versus unknown evidence obvious and keeps outfalls and locations distinct', () => {
    useFetch.mockReturnValue({ data: data(), error: undefined, isPending: false });
    render(<CsoCatchmentMonitoring />);
    expect(screen.getByText(/have a fresh report/).textContent)
      .toBe('1,405 of 1,514 outfalls have a fresh report. 109 have no usable current report and are unknown, not clear.');
    expect(screen.getByRole('img', { name: /Current evidence across 1,514 outfalls/ })).toBeInTheDocument();
    expect(screen.getByText('Monitored outfalls').nextSibling)
      .toHaveTextContent('At 1,390 distinct locations, 4 outfalls without a published location; 150 outfalls share a location with another.');
    expect(screen.getByText('Spilling now').nextSibling).toHaveTextContent('Fresh spilling reports at 2 distinct locations.');
    expect(screen.getByText(/30 outfalls could not be collected/)).toHaveTextContent('a page failed to load');
    expect(screen.getByText(/Collection was incomplete in the last 48 hours for 1,484 outfalls/)).toBeInTheDocument();
    expect(screen.getByText('Not read (incomplete collection): 30')).toBeInTheDocument();
    expect(screen.getByText(/Typical report age 7 min \(oldest 2 hr\); read 2 min ago/)).toBeInTheDocument();
    expect(screen.getByText(/same location as 1 other outfall/)).toBeInTheDocument();
  });

  test('the comparison labels the sources as not interchangeable and shows RDP bounds', () => {
    useFetch.mockReturnValue({ data: data(), error: undefined, isPending: false });
    render(<CsoCatchmentMonitoring />);
    fireEvent.click(screen.getByRole('button', { name: /Compare with the existing density history/ }));
    expect(screen.getByText(/not interchangeable/)).toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent).slice(1)).toEqual(['0.0123', '4', '1 / 5 of 5', '1,450', '3–5', '2']);
  });

  test.each([
    [{ state: 'unavailable', reason: 'set_not_enabled' }, /not enabled on this environment yet/],
    [{ state: 'unavailable', reason: 'read_failed' }, /temporarily unavailable/],
  ])('degrades cleanly when RDP is unavailable: %j', (overrides, message) => {
    useFetch.mockReturnValue({ data: { enabled: true, set: data().set, ...overrides }, error: undefined, isPending: false });
    render(<CsoCatchmentMonitoring />);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(screen.getByRole('status')).toHaveTextContent('The rest of this page is not affected.');
    expect(screen.queryByText('Monitored outfalls')).not.toBeInTheDocument();
  });

  test('a fetch error is isolated to the section', () => {
    useFetch.mockReturnValue({ data: undefined, error: new Error('x'), isPending: false });
    render(<CsoCatchmentMonitoring />);
    expect(screen.getByRole('status')).toHaveTextContent(/temporarily unavailable/);
  });

  test('reports a set size that differs from the reviewed set, duplicates and missing locations', () => {
    const value = data({ selection: { reportedTotal: 1200, matchesReviewed: false, catalogueMembers: null, notInCatalogue: null },
      read: { ...data().read, missing: 0, duplicates: 2, catalogueError: 'TIMEOUT' } });
    const texts = readMessages(value).map((message) => message.text);
    expect(texts).toEqual(expect.arrayContaining([
      'River Data Platform reports 1,200 outfalls in this set; the reviewed set has 1,514.',
      '2 duplicate outfall entries were ignored.',
      'Outfall locations are unavailable right now, so distinct locations cannot be counted.',
    ]));
  });

  test('formats ages', () => {
    expect([formatAge(30), formatAge(600), formatAge(7200), formatAge(null)]).toEqual(['30 s', '10 min', '2 hr', 'unknown']);
  });
});
