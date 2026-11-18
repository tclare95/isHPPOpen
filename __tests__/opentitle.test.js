/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import OpenTitle from '../components/functional/opentitle';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);

const mockUseFetch = useFetch;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();

const ok = (data) => ({ data, error: undefined, isPending: false });
const pending = { data: undefined, error: undefined, isPending: true };
const failed = { data: undefined, error: new Error('down'), isPending: false };

const freshLevel = (reading_level, minutes = 10) => ok({
  level_data: [{ reading_level, reading_date: minutesAgo(minutes) }],
  health: { state: 'fresh', generatedAt: minutesAgo(minutes) },
});
const recorded = (currentStatus, extra = {}) => ok({
  isEmpty: false,
  currentStatus,
  effectiveLastOpenAt: daysFromNow(-3),
  health: { state: 'fresh' },
  ...extra,
});

function mockResponses({ levels = freshLevel(1.4), status = recorded(true) } = {}) {
  mockUseFetch.mockImplementation((path) => {
    if (path === '/api/levels') return levels;
    if (path === '/api/hppstatus') return status;
    return ok(undefined);
  });
}

const heading = () => screen.findByRole('heading', { level: 2 });

describe('OpenTitle', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows a loading state, not a status, while the HPP status is pending', async () => {
    mockResponses({ status: pending, levels: pending });
    render(<OpenTitle cachedEvents={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading HPP status');
    expect(await screen.findByText(/Loading HPP status/)).toBeInTheDocument();
    expect(screen.queryByText(/Open|Closed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
  });

  test('shows the recorded open status even when the level alone would say closed', async () => {
    mockResponses({ levels: freshLevel(2.5), status: recorded(true) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP is Open');
    expect(screen.getByText(/latest reading \(2\.50 m\) is at or above 2\.2 m/)).toBeInTheDocument();
  });

  test('at exactly 2.2 m a recorded closure agrees with the service rule', async () => {
    mockResponses({ levels: freshLevel(2.2), status: recorded(false) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP is Closed because of water levels');
    expect(screen.getByText(/closed for 3 days/)).toBeInTheDocument();
    expect(screen.queryByText(/latest reading/)).not.toBeInTheDocument();
  });

  test('at exactly 2.2 m a recorded open status is flagged as not yet updated, never shown as closed', async () => {
    mockResponses({ levels: freshLevel(2.2), status: recorded(true) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP is Open');
    expect(screen.getByText(/latest reading \(2\.20 m\) is at or above 2\.2 m/)).toBeInTheDocument();
  });

  test('just below 2.2 m a recorded closure is kept and flagged', async () => {
    mockResponses({ levels: freshLevel(2.19), status: recorded(false) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('Closed');
    expect(screen.getByText(/latest reading \(2\.19 m\) is below 2\.2 m/)).toBeInTheDocument();
  });

  test('a stale reading adds no warning under the title (it is shown once, under the river level)', async () => {
    mockResponses({ levels: freshLevel(1.4, 180) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('Open');
    expect(screen.queryByText(/out of date|last recorded status|hours? old/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('a missing or failed level read does not hide the recorded status', async () => {
    mockResponses({ levels: ok({ level_data: [], health: { state: 'unavailable' } }), status: recorded(false) });
    const { unmount } = render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('Closed');
    expect(screen.queryByText(/latest reading/)).not.toBeInTheDocument();
    unmount();

    mockResponses({ levels: failed, status: recorded(true) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('Open');
  });

  test('a failed status request or the fallback payload is unavailable, not open', async () => {
    mockResponses({ status: failed });
    const { unmount } = render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP status is currently unavailable');
    unmount();

    mockResponses({ status: ok({ isEmpty: true, currentStatus: null, health: { state: 'unavailable' } }) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP status is currently unavailable');
  });

  test('no recorded status is unknown', async () => {
    mockResponses({ status: ok({ isEmpty: true, currentStatus: null, health: { state: 'fresh' } }) });
    render(<OpenTitle cachedEvents={[]} />);
    expect(await heading()).toHaveTextContent('HPP status is Unknown');
  });

  test('an event today closes the course whatever the level status, even before it loads', async () => {
    const events = [{ event_start_date: daysFromNow(-1), event_end_date: daysFromNow(1) }];
    for (const status of [recorded(true), pending, failed]) {
      mockResponses({ status });
      const { unmount } = render(<OpenTitle cachedEvents={events} />);
      expect(await heading()).toHaveTextContent('HPP is Closed for an event');
      unmount();
    }
  });

  test('future or undated events do not restrict the course', async () => {
    const events = [
      { event_start_date: daysFromNow(2), event_end_date: daysFromNow(3) },
      { event_start_date: null, event_end_date: daysFromNow(1) },
    ];
    mockResponses();
    render(<OpenTitle cachedEvents={events} />);
    expect(await heading()).toHaveTextContent('HPP is Open');
  });
  describe('when the cached homepage snapshot could not read events', () => {
    const today = { event_start_date: daysFromNow(-1), event_end_date: daysFromNow(1) };
    const withEvents = (events) => {
      mockUseFetch.mockImplementation((path) => {
        if (path === '/api/levels') return freshLevel(1.4);
        if (path === '/api/hppstatus') return recorded(true);
        if (path === '/api/events?limit=5') return events;
        return ok(undefined);
      });
    };

    test('reads events itself and shows an event closure instead of Open', async () => {
      withEvents(ok({ count: 1, eventsArray: [today] }));
      render(<OpenTitle cachedEvents={[]} eventsUnavailable />);
      expect(await heading()).toHaveTextContent('HPP is Closed for an event');
    });

    test('waits for the event check instead of showing Open', async () => {
      withEvents(pending);
      render(<OpenTitle cachedEvents={[]} eventsUnavailable />);
      expect(await screen.findByText(/Loading HPP status/)).toBeInTheDocument();
      expect(screen.queryByText(/Open/)).not.toBeInTheDocument();
    });

    test('says event closures could not be checked when the event read also fails', async () => {
      withEvents(failed);
      render(<OpenTitle cachedEvents={[]} eventsUnavailable />);
      expect(await heading()).toHaveTextContent('HPP is Open');
      expect(screen.getByText(/events could not be checked right now, so the course may still be closed for an event/)).toBeInTheDocument();
    });

    test('does not read events again when the snapshot has them', async () => {
      withEvents(failed);
      render(<OpenTitle cachedEvents={[]} />);
      expect(await heading()).toHaveTextContent('HPP is Open');
      expect(mockUseFetch.mock.calls.map(([path]) => path)).not.toContain('/api/events?limit=5');
      expect(screen.queryByText(/could not be checked/)).not.toBeInTheDocument();
    });
  });
});
