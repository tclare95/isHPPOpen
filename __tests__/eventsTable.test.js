import { fireEvent, render, screen } from '@testing-library/react';
import useSWR from 'swr';
import EventsTable from '../components/functional/eventstable';

jest.mock('swr', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../components/functional/eventsform', () => function MockEventsForm({ mode, event }) {
  return <div data-testid="editor">{mode}:{event?._id ?? 'new'}</div>;
});
const alpha = { _id: 'alpha', event_name: 'Alpha', event_details: 'First' };
const beta = { _id: 'beta', event_name: 'Beta', event_details: 'Second' };
const supply = (eventsArray) => useSWR.mockReturnValue({ data: { eventsArray }, mutate: jest.fn(), isLoading: false });

describe('Events table selection', () => {
  beforeEach(() => { jest.clearAllMocks(); supply([alpha, beta]); });

  test('keeps a selected event across refreshes', () => {
    const view = render(<EventsTable />);
    fireEvent.click(screen.getByText('Beta'));
    supply([{ ...beta, event_name: 'Updated beta' }, alpha]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('edit:beta');
  });

  test('falls back to the first remaining event after deletion without reviving the removed selection', () => {
    const view = render(<EventsTable />);
    fireEvent.click(screen.getByText('Alpha'));
    supply([beta]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('edit:beta');
    supply([alpha, beta]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('edit:beta');
  });

  test('returns to a new event when the selected list becomes empty', () => {
    const view = render(<EventsTable />);
    fireEvent.click(screen.getByText('Alpha'));
    supply([]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('create:new');
    supply([beta]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('create:new');
  });

  test('preserves an explicitly chosen new-event editor during refresh', () => {
    const view = render(<EventsTable />);
    fireEvent.click(screen.getByText('Alpha'));
    fireEvent.click(screen.getByRole('button', { name: '+ New event' }));
    supply([beta]);
    view.rerender(<EventsTable />);
    expect(screen.getByTestId('editor')).toHaveTextContent('create:new');
  });
});
