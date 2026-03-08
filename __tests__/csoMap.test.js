/* eslint-disable react/prop-types */
import { render, screen } from '@testing-library/react';
import WaterQualityMap from '../components/functional/csoMap';
import useFetch from '../libs/useFetch';

jest.mock('../libs/useFetch');
jest.mock('leaflet', () => ({
  Icon: function Icon(config) {
    return config;
  },
}));
jest.mock('next/dynamic', () => (loader) => {
  const source = loader.toString();

  const MapContainer = ({ children }) => <div data-testid="map-container">{children}</div>;

  const TileLayer = () => <div data-testid="tile-layer" />;

  const Marker = ({ children }) => <div data-testid="marker">{children}</div>;

  const Popup = ({ children }) => <div data-testid="popup">{children}</div>;

  if (source.includes('mod.MapContainer')) {
    return MapContainer;
  }

  if (source.includes('mod.TileLayer')) {
    return TileLayer;
  }

  if (source.includes('mod.Marker')) {
    return Marker;
  }

  if (source.includes('mod.Popup')) {
    return Popup;
  }

  return () => null;
});

const mockUseFetch = useFetch;

function mockResponses(responses) {
  mockUseFetch.mockImplementation((path) => {
    if (path in responses) {
      return responses[path];
    }

    return { data: undefined, error: undefined, isPending: false };
  });
}

describe('WaterQualityMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state while primary data is pending', () => {
    mockResponses({
      '/api/waterquality': { data: undefined, error: undefined, isPending: true },
      null: { data: undefined, error: undefined, isPending: false },
    });

    render(<WaterQualityMap />);

    expect(screen.getByText('Loading map data...')).toBeInTheDocument();
  });

  it('renders error state when primary data fails', () => {
    mockResponses({
      '/api/waterquality': { data: undefined, error: new Error('boom'), isPending: false },
      null: { data: undefined, error: undefined, isPending: false },
    });

    render(<WaterQualityMap />);

    expect(screen.getByText('Unable to load map data right now.')).toBeInTheDocument();
  });

  it('renders empty state when no map payload is available', () => {
    mockResponses({
      '/api/waterquality': {
        data: { waterQualityData: null },
        error: undefined,
        isPending: false,
      },
      null: { data: undefined, error: undefined, isPending: false },
    });

    render(<WaterQualityMap />);

    expect(screen.getByText('No map data available.')).toBeInTheDocument();
  });

  it('renders no-locations state when the snapshot has no CSOs', () => {
    mockResponses({
      '/api/waterquality': {
        data: {
          waterQualityData: {
            ActiveCSOIds: [],
            WaterQuality: { CSOIds: [] },
          },
        },
        error: undefined,
        isPending: false,
      },
      null: { data: undefined, error: undefined, isPending: false },
    });

    render(<WaterQualityMap />);

    expect(screen.getByText('No recent CSO locations found.')).toBeInTheDocument();
  });

  it('renders the map with CSO details from useFetch', () => {
    mockResponses({
      '/api/waterquality': {
        data: {
          waterQualityData: {
            ActiveCSOIds: ['CSO1'],
            WaterQuality: { CSOIds: ['CSO1'] },
          },
        },
        error: undefined,
        isPending: false,
      },
      '/api/waterquality/cso?ids=CSO1': {
        data: {
          csoData: {
            CSO1: {
              LatestEventStart: '2026-03-08T08:00:00Z',
              LatestEventEnd: '2026-03-08T09:30:00Z',
              Coordinates: { x: 1.2, y: 3.4 },
            },
          },
        },
        error: undefined,
        isPending: false,
      },
    });

    render(<WaterQualityMap />);

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getByText('CSO ID: CSO1')).toBeInTheDocument();
    expect(screen.getByText('Currently Active')).toBeInTheDocument();
    expect(screen.getByText(/Active Time:/)).toBeInTheDocument();
  });
});
