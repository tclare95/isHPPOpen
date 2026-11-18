import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventsForm from '../components/functional/eventsform';

const json = (status, payload) => ({ ok: status < 400, status, async json() { return payload; } });
const existing = { id: '507f1f77bcf86cd799439011', name: 'Existing event', startDate: '2026-03-29', endDate: '2026-03-30', details: 'Existing details' };

describe('EventsForm component', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('shows validation errors for invalid fields', async () => {
    const user = userEvent.setup();

    render(<EventsForm event={null} />);

    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByText(/event name is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/event details are required/i)).toBeInTheDocument();
    expect(screen.getByText(/fix the highlighted fields before saving/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('creates through the admin API and reports the saved event', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    const saved = { id: '650000000000000000000003', name: 'National Race' };
    globalThis.fetch.mockResolvedValue(json(201, { ok: true, data: { event: saved } }));

    render(<EventsForm event={null} onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/event name/i), 'National Race');
    await user.type(screen.getByLabelText(/public details/i), 'Important details for visitors.');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, 'Event created.'));
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/admin/events', expect.objectContaining({ method: 'POST' }));
  });

  test('loads a saved event exactly, including date-only values across a DST change', () => {
    render(<EventsForm event={existing} />);

    expect(screen.getByRole('heading', { name: 'Editing “Existing event”' })).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2026-03-29');
    expect(screen.getByLabelText(/end date/i)).toHaveValue('2026-03-30');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  test('requires confirmation before deleting an existing event', async () => {
    const user = userEvent.setup();
    const onDeleted = jest.fn();
    globalThis.fetch.mockResolvedValue(json(200, { ok: true, data: { deleted: true } }));

    render(<EventsForm event={existing} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: /delete event/i }));
    expect(screen.getByText(/delete “existing event” permanently/i)).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/admin/events/507f1f77bcf86cd799439011',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
    expect(onDeleted).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'Existing event');
  });

  test('a server error keeps the input and does not report success', async () => {
    const user = userEvent.setup();
    const onSaved = jest.fn();
    globalThis.fetch.mockResolvedValue(json(400, { ok: false, error: { message: 'Start date must be a real date in YYYY-MM-DD format.' } }));

    render(<EventsForm event={null} onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/event name/i), 'Test Event');
    await user.type(screen.getByLabelText(/public details/i), 'Some details');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved. Start date must be a real date');
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Test Event');
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('a network failure keeps the input and does not report success', async () => {
    const user = userEvent.setup();
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<EventsForm event={null} />);

    await user.type(screen.getByLabelText(/event name/i), 'Offline Event');
    await user.type(screen.getByLabelText(/public details/i), 'Some details');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t reach the server/i);
    expect(screen.getByLabelText(/event name/i)).toHaveValue('Offline Event');
    expect(screen.queryByText('Event created.')).not.toBeInTheDocument();
  });
});
