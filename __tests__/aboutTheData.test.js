import { render, screen } from '@testing-library/react';
import AboutTheData from '../components/functional/aboutTheData';

describe('AboutTheData', () => {
  it('attributes every source once, including the reviewed upstream set', () => {
    render(<AboutTheData membership={{ source: 'rdp', state: 'available', relationshipSet: 'hpp-upstream-outfalls', version: 'bb422e98d78ee1bc5923',
      scopes: [{ name: 'confirmed', count: 592 }], catalogues: [{ providerLabel: 'Severn Trent Water', attribution: 'Severn Trent Water storm overflow activity (public ArcGIS layer)' }] }} />);
    expect(screen.getByText(/Severn Trent Water, collected by River Data Platform about every 15 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/the 592 outfalls in River Data Platform's reviewed set hpp-upstream-outfalls \(version bb422e98d78e\)/)).toBeInTheDocument();
    expect(screen.getByText(/Environment Agency/)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
    expect(screen.queryByText(/ArcGIS|licence/)).not.toBeInTheDocument();
  });

  it('falls back to the provider without a set for the legacy or unavailable list', () => {
    render(<AboutTheData membership={{ source: 'rdp', state: 'unavailable' }} />);
    expect(screen.getByText(/Severn Trent Water, collected by River Data Platform/)).toBeInTheDocument();
    expect(screen.queryByText(/Upstream outfalls:/)).not.toBeInTheDocument();
  });
});
