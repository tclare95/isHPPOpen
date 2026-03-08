import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventsForm from '../components/functional/eventsform';

describe('EventsForm component', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('shows validation errors for invalid fields', async () => {
    const user = userEvent.setup();

    render(<EventsForm mode="create" event={null} />);

    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByText(/event name is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/event details are required/i)).toBeInTheDocument();
    expect(screen.getByText(/fix the highlighted fields before saving/i)).toBeInTheDocument();
  });

  test('submits valid data and reports success', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { id: 'event-123' } };
      },
    });

    render(<EventsForm mode="create" event={null} onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/event name/i), 'National Race');
    await user.clear(screen.getByLabelText(/public details/i));
    await user.type(screen.getByLabelText(/public details/i), 'Important details for visitors.');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText(/event created successfully/i)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith('event-123');
  });

  test('requires confirmation before deleting an existing event', async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { deleted: true } };
      },
    });

    render(
      <EventsForm
        mode="edit"
        event={{
          _id: '507f1f77bcf86cd799439011',
          event_name: 'Existing event',
          event_start_date: '2026-03-08',
          event_end_date: '2026-03-09',
          event_details: 'Existing details',
        }}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete event/i }));
    expect(screen.getByText(/delete this event permanently/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/events?id=507f1f77bcf86cd799439011',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    expect(onDeleted).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });

  test('shows a server error when save fails', async () => {
    const user = userEvent.setup();

    globalThis.fetch.mockResolvedValue({
      ok: false,
      async json() {
        return { ok: false, error: { message: 'Unauthorized' } };
      },
    });

    render(<EventsForm mode="create" event={null} />);

    await user.type(screen.getByLabelText(/event name/i), 'Test Event');
    await user.clear(screen.getByLabelText(/public details/i));
    await user.type(screen.getByLabelText(/public details/i), 'Some details');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByText(/unauthorized/i)).toBeInTheDocument();
  });
});
