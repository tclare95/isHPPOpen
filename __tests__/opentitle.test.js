/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import OpenTitle from '../components/functional/opentitle';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('next/link', () => ({ children, href }) => <a href={href}>{children}</a>);

const mockUseFetch = useFetch;

function mockResponses(responses) {
  mockUseFetch.mockImplementation((path) => {
    if (path in responses) {
      return responses[path];
    }

    return { data: undefined, error: undefined, isPending: false };
  });
}

describe('OpenTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders unknown status when level data is empty', () => {
    mockResponses({
      '/api/levels': {
        data: { level_data: [] },
        error: undefined,
        isPending: false,
      },
      '/api/hppstatus': {
        data: {
          isEmpty: false,
          effectiveLastOpenAt: '2026-03-08T10:00:00Z',
        },
        error: undefined,
        isPending: false,
      },
    });

    render(<OpenTitle cachedEvents={[]} />);

    expect(screen.getByText(/HPP status is/i)).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders closed when latest level is above threshold', () => {
    mockResponses({
      '/api/levels': {
        data: { level_data: [{ reading_level: 2.5, reading_date: '2026-03-08T10:00:00Z' }] },
        error: undefined,
        isPending: false,
      },
      '/api/hppstatus': {
        data: {
          isEmpty: false,
          effectiveLastOpenAt: '2026-03-01T10:00:00Z',
        },
        error: undefined,
        isPending: false,
      },
    });

    render(<OpenTitle cachedEvents={[]} />);

    expect(screen.getByText(/HPP is/i)).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});