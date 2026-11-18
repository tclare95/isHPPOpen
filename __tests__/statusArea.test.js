import { render, screen } from '@testing-library/react';
import StatusArea from '../components/layout/frontpage/statusarea';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href, className }) => <a href={href} className={className}>{children}</a>);
jest.mock('../components/layout/frontpage/historicalConditions', () => () => <div data-testid="historical-conditions" />);

const respond = (result) => useFetch.mockReturnValue(result);
const ok = (data) => ({ data, error: undefined, isPending: false });

const status = (extra = {}) => ({
  isEmpty: false,
  currentStatus: false,
  lastChangedAt: '2026-11-10T08:00:00.000Z',
  closuresInLast7Days: 7,
  closuresInLast28Days: 8,
  closuresInLast182Days: 20,
  closuresInLast365Days: 40,
  health: { state: 'fresh', generatedAt: new Date().toISOString() },
  ...extra,
});

describe('StatusArea', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows a loading state while pending', () => {
    respond({ data: undefined, error: undefined, isPending: true });
    render(<StatusArea />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Loading HPP closure stats/)).toBeInTheDocument();
  });

  test('a failed request shows an error instead of loading forever', () => {
    respond({ data: undefined, error: new Error('down'), isPending: false });
    render(<StatusArea />);
    expect(screen.getByText(/couldn.t load closure stats/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading HPP closure stats/)).not.toBeInTheDocument();
    expect(screen.queryByText(/of the last 7 days/)).not.toBeInTheDocument();
  });

  test('the route fallback payload is unavailable, not an empty history of zero closures', () => {
    respond(ok(status({
      isEmpty: true,
      currentStatus: null,
      lastChangedAt: null,
      closuresInLast7Days: 0,
      closuresInLast28Days: 0,
      closuresInLast182Days: 0,
      health: { state: 'unavailable' },
    })));
    render(<StatusArea />);
    expect(screen.getByText(/HPP status and closure stats are unavailable right now/)).toBeInTheDocument();
    expect(screen.queryByText(/No historical closure records/)).not.toBeInTheDocument();
    expect(screen.queryByText(/of the last 7 days/)).not.toBeInTheDocument();
    expect(screen.getByTestId('historical-conditions')).toBeInTheDocument();
  });

  test('no records shows unknown status and no fabricated closure figures', () => {
    respond(ok(status({ isEmpty: true, currentStatus: null, lastChangedAt: null, closuresInLast7Days: 0 })));
    render(<StatusArea />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText(/No historical closure records are available yet/)).toBeInTheDocument();
    expect(screen.queryByText(/of the last 7 days/)).not.toBeInTheDocument();
  });

  test('a recorded closure shows the authoritative status and closure windows', () => {
    respond(ok(status()));
    render(<StatusArea />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText(/HPP was last open on/)).toBeInTheDocument();
    expect(screen.getByText(/of the last 7 days/)).toBeInTheDocument();
    expect(screen.getByLabelText('HPP closed 100% of the last 7 days')).toBeInTheDocument();
  });

  test('a missing closure count is omitted rather than shown as zero', () => {
    respond(ok(status({ currentStatus: true, closuresInLast182Days: undefined })));
    render(<StatusArea />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByText(/HPP was last open on/)).not.toBeInTheDocument();
    expect(screen.getByText(/of the last 28 days/)).toBeInTheDocument();
    expect(screen.queryByText(/of the last 182 days/)).not.toBeInTheDocument();
  });
});
