import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import MessageEditor from '../components/functional/messageeditor';

// Real SWR (no mock): the post-save refetch must not wipe the result or the editor's state.
const saved = (overrides = {}) => ({
  banner_title: 'Planned update',
  banner_message: 'Course closed for maintenance',
  banner_enabled: true,
  banner_start_date: '2026-03-08T10:00:00.000Z',
  banner_end_date: null,
  banner_update_date: '2026-03-08T09:00:00.000Z',
  ...overrides,
});

const json = (status, payload) => ({ ok: status < 400, status, async json() { return payload; } });

function renderEditor() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MessageEditor />
    </SWRConfig>,
  );
}

describe('MessageEditor with live SWR revalidation', () => {
  let stored;

  beforeEach(() => {
    stored = saved();
    globalThis.fetch = jest.fn(async (url, init = {}) => {
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        stored = { ...stored, ...body, banner_update_date: '2026-03-09T09:00:00.000Z' };
        return json(200, { ok: true, data: { message: 'Banner updated' } });
      }
      return json(200, { ok: true, data: [stored] });
    });
  });

  afterEach(() => jest.resetAllMocks());

  test('keeps the success message after the saved banner is refetched', async () => {
    const user = userEvent.setup();
    renderEditor();
    const title = await screen.findByLabelText(/banner title/i);
    await user.clear(title);
    await user.type(title, 'Live update');
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(screen.getByText('Live update', { selector: '.fw-semibold' })).toBeInTheDocument());
    await waitFor(() => expect(globalThis.fetch.mock.calls.filter(([, init]) => !init?.method).length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText(/banner settings updated/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/banner title/i)).toHaveValue('Live update');
  });

  test('a failed save keeps the typed message and never claims success', async () => {
    const user = userEvent.setup();
    globalThis.fetch.mockImplementation(async (url, init = {}) => (init.method === 'POST'
      ? json(403, { ok: false, error: { message: 'Forbidden' } })
      : json(200, { ok: true, data: [stored] })));
    renderEditor();
    const message = await screen.findByLabelText(/banner message/i);
    await user.clear(message);
    await user.type(message, 'Unsaved draft');
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    expect(await screen.findByText(/not authorised/i)).toBeInTheDocument();
    expect(screen.queryByText(/banner settings updated/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/banner message/i)).toHaveValue('Unsaved draft');
  });

  test('scheduling and visibility round-trip through a save', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByLabelText(/banner title/i);
    await user.click(screen.getByLabelText(/show banner on the homepage/i));
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/sitebanner', expect.objectContaining({ method: 'POST' })));
    const [, request] = globalThis.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(request.body)).toEqual({
      banner_title: 'Planned update',
      banner_message: 'Course closed for maintenance',
      banner_enabled: false,
      banner_start_date: '2026-03-08T10:00:00.000Z',
      banner_end_date: null,
    });
    expect(await screen.findByText(/banner settings updated/i)).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });
});
