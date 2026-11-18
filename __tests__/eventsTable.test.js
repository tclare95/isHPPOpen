import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import EventsTable from '../components/functional/eventstable';

const past = { id: '650000000000000000000001', name: 'Spring Slalom', startDate: '2024-04-30', endDate: '2024-05-01', details: 'Past race', timing: 'past' };
const future = { id: '650000000000000000000002', name: 'Autumn Freestyle', startDate: '2026-12-05', endDate: '2026-12-06', details: 'Future jam', timing: 'upcoming' };

const json = (status, payload) => ({ ok: status < 400, status, async json() { return payload; } });
const page = (events, extra = {}) => json(200, { ok: true, data: { events, total: events.length, page: 1, pageSize: 20, totalPages: 1, ...extra } });
const listCalls = () => globalThis.fetch.mock.calls.filter(([url, init]) => url.startsWith('/api/admin/events?') && (init?.method ?? 'GET') === 'GET');
const writes = (method) => globalThis.fetch.mock.calls.filter(([, init]) => init?.method === method);

function renderTable() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <EventsTable />
    </SWRConfig>,
  );
}

describe('Admin events manager', () => {
  let user;

  beforeEach(() => {
    user = userEvent.setup();
    globalThis.fetch = jest.fn(async (url) => {
      const scope = new URL(url, 'http://localhost').searchParams.get('scope');
      return page(scope === 'past' ? [past] : scope === 'all' ? [future, past] : [future]);
    });
    window.confirm = jest.fn(() => true);
  });

  afterEach(() => jest.resetAllMocks());

  test('loads upcoming events from the admin read, not the public feed or a fixed 99 limit', async () => {
    renderTable();
    expect(await screen.findByText('Autumn Freestyle')).toBeInTheDocument();
    expect(listCalls()[0][0]).toBe('/api/admin/events?scope=upcoming&page=1&pageSize=20');
    expect(globalThis.fetch.mock.calls.some(([calledUrl]) => calledUrl.includes('limit=99'))).toBe(false);
  });

  test('filters to past events and searches by text', async () => {
    renderTable();
    await screen.findByText('Autumn Freestyle');
    await user.click(screen.getByRole('button', { name: 'Past' }));
    expect(await screen.findByText('Spring Slalom')).toBeInTheDocument();
    expect(screen.getByText('30 Apr 2024 → 1 May 2024')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Search events' }), 'slalom');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(listCalls().at(-1)[0]).toBe('/api/admin/events?scope=past&page=1&pageSize=20&q=slalom'));
  });

  test('pages through results', async () => {
    globalThis.fetch.mockImplementation(async (url) => {
      const current = Number(new URL(url, 'http://localhost').searchParams.get('page'));
      return page(current === 1 ? [future] : [past], { total: 21, page: current, totalPages: 2 });
    });
    renderTable();
    await screen.findByText('Page 1 of 2');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Spring Slalom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('selecting a past event loads its saved values into the form in edit mode', async () => {
    renderTable();
    await user.click(await screen.findByRole('button', { name: 'Past' }));
    await user.click(await screen.findByText('Spring Slalom'));

    expect(screen.getByRole('heading', { name: 'Editing “Spring Slalom”' })).toBeInTheDocument();
    expect(screen.getByLabelText('Event name')).toHaveValue('Spring Slalom');
    expect(screen.getByLabelText('Start date')).toHaveValue('2024-04-30');
    expect(screen.getByLabelText('End date')).toHaveValue('2024-05-01');
    expect(screen.getByLabelText('Public details')).toHaveValue('Past race');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  test('an edit saves by id with PUT and stays on the saved event', async () => {
    renderTable();
    await user.click(await screen.findByText('Autumn Freestyle'));
    globalThis.fetch.mockImplementationOnce(async () => json(200, {
      ok: true, data: { event: { ...future, name: 'Autumn Freestyle Open' }, changed: true },
    }));
    await user.clear(screen.getByLabelText('Event name'));
    await user.type(screen.getByLabelText('Event name'), 'Autumn Freestyle Open');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Event updated.')).toBeInTheDocument();
    const [url, init] = writes('PUT')[0];
    expect(url).toBe(`/api/admin/events/${future.id}`);
    expect(JSON.parse(init.body)).toEqual({ name: 'Autumn Freestyle Open', startDate: '2026-12-05', endDate: '2026-12-06', details: 'Future jam' });
    expect(screen.getByRole('heading', { name: 'Editing “Autumn Freestyle Open”' })).toBeInTheDocument();
    expect(writes('POST')).toHaveLength(0);
  });

  test('a failed save keeps the typed values and never claims success', async () => {
    renderTable();
    await user.click(await screen.findByText('Autumn Freestyle'));
    globalThis.fetch.mockImplementationOnce(async () => json(500, { ok: false, error: { message: 'Internal Server Error' } }));
    await user.clear(screen.getByLabelText('Public details'));
    await user.type(screen.getByLabelText('Public details'), 'Edited but unsaved');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved. Internal Server Error');
    expect(screen.getByLabelText('Public details')).toHaveValue('Edited but unsaved');
    expect(screen.queryByText('Event updated.')).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  test.each([
    [401, /session has ended/i],
    [403, /not authorised/i],
  ])('a %s on save explains the access problem and keeps the input', async (status, copy) => {
    renderTable();
    await screen.findByText('Autumn Freestyle');
    globalThis.fetch.mockImplementationOnce(async () => json(status, { ok: false, error: { message: status === 401 ? 'Unauthorized' : 'Forbidden' } }));
    await user.type(screen.getByLabelText('Event name'), 'Draft race');
    await user.type(screen.getByLabelText('Public details'), 'Draft details');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(copy);
    expect(screen.getByLabelText('Event name')).toHaveValue('Draft race');
    expect(screen.getByRole('heading', { name: 'New event' })).toBeInTheDocument();
  });

  test('a 403 on the list read is explained rather than shown as no events', async () => {
    globalThis.fetch.mockImplementation(async () => json(403, { ok: false, error: { message: 'Forbidden' } }));
    renderTable();
    expect(await screen.findByText(/not authorised/i)).toBeInTheDocument();
    expect(screen.queryByText(/no upcoming events/i)).not.toBeInTheDocument();
  });

  test('creating posts a new event without an id, then switches to editing it', async () => {
    renderTable();
    await screen.findByText('Autumn Freestyle');
    const created = { id: '650000000000000000000009', name: 'Autumn Freestyle', startDate: '2026-12-05', endDate: '2026-12-05', details: 'Second heat', timing: 'upcoming' };
    globalThis.fetch.mockImplementationOnce(async () => json(201, { ok: true, data: { event: created } }));

    await user.type(screen.getByLabelText('Event name'), 'Autumn Freestyle');
    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-12-05');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-12-05');
    await user.type(screen.getByLabelText('Public details'), 'Second heat');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText('Event created.')).toBeInTheDocument();
    const [url, init] = writes('POST')[0];
    expect(url).toBe('/api/admin/events');
    expect(JSON.parse(init.body)).not.toHaveProperty('id');
    expect(screen.getByRole('heading', { name: 'Editing “Autumn Freestyle”' })).toBeInTheDocument();
  });

  test('rejects an end date before the start date without sending', async () => {
    renderTable();
    await screen.findByText('Autumn Freestyle');
    await user.type(screen.getByLabelText('Event name'), 'Backwards');
    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-12-05');
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-12-04');
    await user.type(screen.getByLabelText('Public details'), 'Details');
    await user.click(screen.getByRole('button', { name: 'Create event' }));

    expect(await screen.findByText(/end date can’t be before start date/i)).toBeInTheDocument();
    expect(writes('POST')).toHaveLength(0);
  });

  test('delete requires confirmation, targets the id and returns to new-event mode', async () => {
    renderTable();
    await user.click(await screen.findByText('Autumn Freestyle'));
    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    expect(screen.getByText('Delete “Autumn Freestyle” permanently?')).toBeInTheDocument();
    expect(writes('DELETE')).toHaveLength(0);

    globalThis.fetch.mockImplementationOnce(async () => json(200, { ok: true, data: { deleted: true, id: future.id } }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(await screen.findByText('Deleted “Autumn Freestyle”.')).toBeInTheDocument();
    expect(writes('DELETE')[0][0]).toBe(`/api/admin/events/${future.id}`);
    expect(screen.getByRole('heading', { name: 'New event' })).toBeInTheDocument();
  });

  test('a failed delete keeps the event open and reports the failure', async () => {
    renderTable();
    await user.click(await screen.findByText('Autumn Freestyle'));
    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    globalThis.fetch.mockImplementationOnce(async () => json(404, { ok: false, error: { message: 'Event not found' } }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not deleted. Event not found');
    expect(screen.getByRole('heading', { name: 'Editing “Autumn Freestyle”' })).toBeInTheDocument();
  });

  test('asks before discarding unsaved changes when switching events', async () => {
    window.confirm.mockReturnValue(false);
    renderTable();
    await user.click(await screen.findByRole('button', { name: 'All' }));
    await user.click(await screen.findByText('Spring Slalom'));
    await user.click(screen.getByText('Autumn Freestyle'));
    await user.type(screen.getByLabelText('Public details'), ' and more');
    await user.click(screen.getByText('Spring Slalom'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Editing “Autumn Freestyle”' })).toBeInTheDocument();
    expect(screen.getByLabelText('Public details')).toHaveValue('Future jam and more');
  });
});
