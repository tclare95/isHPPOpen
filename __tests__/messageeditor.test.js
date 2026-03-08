import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useSWR, { mutate } from 'swr';
import MessageEditor from '../components/functional/messageeditor';

jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
  mutate: jest.fn(),
}));

describe('MessageEditor component', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn();
    useSWR.mockReturnValue({
      data: [
        {
          banner_title: 'Planned update',
          banner_message: 'Course closed for maintenance',
          banner_enabled: true,
          banner_start_date: '2026-03-08T10:00:00.000Z',
          banner_end_date: '2026-03-09T10:00:00.000Z',
          banner_update_date: '2026-03-08T09:00:00.000Z',
        },
      ],
      error: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('renders current banner state and saves updates', async () => {
    const user = userEvent.setup();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { message: 'Banner updated' } };
      },
    });

    render(<MessageEditor />);

    expect(screen.getByText(/current banner/i)).toBeInTheDocument();
    expect(screen.getAllByText(/course closed for maintenance/i)).toHaveLength(2);

    await user.clear(screen.getByLabelText(/banner title/i));
    await user.type(screen.getByLabelText(/banner title/i), 'Live update');
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith('/api/sitebanner');
    expect(await screen.findByText(/banner settings updated/i)).toBeInTheDocument();
  });

  test('allows hiding the banner without losing the message', async () => {
    const user = userEvent.setup();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { message: 'Banner updated' } };
      },
    });

    render(<MessageEditor />);

    await user.click(screen.getByLabelText(/show banner on the homepage/i));
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [, request] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      banner_enabled: false,
      banner_message: 'Course closed for maintenance',
    }));
  });

  test('supports saving an open-ended banner', async () => {
    const user = userEvent.setup();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { message: 'Banner updated' } };
      },
    });

    render(<MessageEditor />);

    await user.click(screen.getByLabelText(/no end date/i));
    expect(screen.getByLabelText(/^end$/i)).toBeDisabled();
    expect(screen.getByText(/this banner will stay live until you hide it/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [, request] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      banner_end_date: null,
    }));
  });

  test('supports saving a banner that starts immediately', async () => {
    const user = userEvent.setup();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      async json() {
        return { ok: true, data: { message: 'Banner updated' } };
      },
    });

    render(<MessageEditor />);

    await user.click(screen.getByLabelText(/start immediately/i));
    expect(screen.getByLabelText(/^start$/i)).toBeDisabled();
    expect(screen.getByText(/the banner will appear as soon as it is enabled/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save banner/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [, request] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual(expect.objectContaining({
      banner_start_date: null,
    }));
  });

  test('shows validation feedback when the banner is enabled without a message', async () => {
    const user = userEvent.setup();

    render(<MessageEditor />);

    await user.clear(screen.getByLabelText(/banner message/i));
    await user.click(screen.getByRole('button', { name: /save banner/i }));

    expect(await screen.findByText(/banner message is required when the banner is enabled/i)).toBeInTheDocument();
  });

  test('shows an error state when loading fails', () => {
    useSWR.mockReturnValue({
      data: null,
      error: new Error('Boom'),
      isLoading: false,
    });

    render(<MessageEditor />);

    expect(screen.getByText(/unable to load the current site banner/i)).toBeInTheDocument();
  });
});