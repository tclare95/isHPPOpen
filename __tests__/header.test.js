import { render, screen } from '@testing-library/react';
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
});
