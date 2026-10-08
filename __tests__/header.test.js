import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import Header from '../components/layout/frontpage/header';

describe('Header banner scheduling', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-08T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders an enabled banner inside its active window', () => {
    render(
      <Header
        message={{
          banner_title: 'Live notice',
          banner_message: 'Banner is visible',
          banner_enabled: true,
          banner_start_date: '2026-03-08T09:00:00.000Z',
          banner_end_date: '2026-03-08T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('Live notice')).toBeInTheDocument();
    expect(screen.getByText('Banner is visible')).toBeInTheDocument();
  });

  test('does not render a banner before its start date', () => {
    render(
      <Header
        message={{
          banner_title: 'Scheduled',
          banner_message: 'Future banner',
          banner_enabled: true,
          banner_start_date: '2026-03-08T12:00:00.000Z',
          banner_end_date: '2026-03-08T15:00:00.000Z',
        }}
      />,
    );

    expect(screen.queryByText('Future banner')).not.toBeInTheDocument();
  });

  test('does not render a banner after its end date', () => {
    render(
      <Header
        message={{
          banner_title: 'Expired',
          banner_message: 'Old banner',
          banner_enabled: true,
          banner_start_date: '2026-03-08T06:00:00.000Z',
          banner_end_date: '2026-03-08T08:00:00.000Z',
        }}
      />,
    );

    expect(screen.queryByText('Old banner')).not.toBeInTheDocument();
  });

  test('renders when schedule dates are missing but banner is enabled', () => {
    render(
      <Header
        message={{
          banner_title: 'Always on',
          banner_message: 'No dates supplied',
          banner_enabled: true,
        }}
      />,
    );

    expect(screen.getByText('No dates supplied')).toBeInTheDocument();
  });

  test('starts and expires without another render, preserving the inclusive end boundary', () => {
    render(<Header message={{ banner_message: 'Scheduled notice', banner_enabled: true,
      banner_start_date: '2026-03-08T10:00:01Z', banner_end_date: '2026-03-08T10:00:03Z' }} />);
    expect(screen.queryByText('Scheduled notice')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Scheduled notice')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(screen.getByText('Scheduled notice')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Scheduled notice')).not.toBeInTheDocument();
  });

  test('replaces scheduled timers on prop changes and clears them on unmount', () => {
    const message = { banner_message: 'Notice', banner_enabled: true, banner_start_date: '2026-03-08T10:00:01Z' };
    const view = render(<Header message={message} />);
    view.rerender(<Header message={{ ...message, banner_start_date: '2026-03-08T10:00:05Z' }} />);
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText('Notice')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(4000));
    expect(screen.getByText('Notice')).toBeInTheDocument();
    view.rerender(<Header message={message} />);
    view.rerender(<Header message={{ ...message, banner_start_date: '2026-04-08T10:00:00Z' }} />);
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
    fireEvent(window, new Event('focus'));
    expect(jest.getTimerCount()).toBe(0);
  });

  test('handles distant dates and reevaluates after the browser resumes', () => {
    render(<Header message={{ banner_message: 'Distant notice', banner_enabled: true,
      banner_start_date: '2026-04-08T10:00:00Z', banner_end_date: '2026-04-09T10:00:00Z' }} />);
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText('Distant notice')).not.toBeInTheDocument();
    act(() => {
      jest.setSystemTime(new Date('2026-04-08T12:00:00Z'));
      fireEvent(window, new Event('focus'));
    });
    expect(screen.getByText('Distant notice')).toBeInTheDocument();
    expect(jest.getTimerCount()).toBe(1);
    act(() => {
      jest.setSystemTime(new Date('2026-04-10T12:00:00Z'));
      fireEvent(window, new Event('focus'));
    });
    expect(screen.queryByText('Distant notice')).not.toBeInTheDocument();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('hydrates cached scheduled markup at the viewing time without a mismatch', async () => {
    const message = { banner_message: 'Hydrated notice', banner_enabled: true,
      banner_start_date: '2026-03-08T11:00:00Z', banner_end_date: '2026-03-08T13:00:00Z' };
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Header message={message} />);
    expect(container.textContent).toBe('');
    document.body.appendChild(container);
    jest.setSystemTime(new Date('2026-03-08T12:00:00Z'));
    const onRecoverableError = jest.fn();
    let root;
    try {
      await act(async () => { root = hydrateRoot(container, <Header message={message} />, { onRecoverableError }); });
      expect(screen.getByText('Hydrated notice')).toBeInTheDocument();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
