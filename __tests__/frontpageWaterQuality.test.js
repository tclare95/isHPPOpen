import { render, screen } from '@testing-library/react';
import WaterQuality from '../components/layout/frontpage/waterquality';

describe('front-page water quality section', () => {
  it('shows an explicit link to the dashboard', () => {
    render(<WaterQuality />);

    expect(screen.getByRole('link', { name: /view water quality dashboard/i })).toHaveAttribute('href', '/waterquality');
  });
});
