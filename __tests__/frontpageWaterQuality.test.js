import { render, screen } from '@testing-library/react';
import WaterQuality from '../components/layout/frontpage/waterquality';

describe('front-page water quality section', () => {
  it('shows an explicit link to the dashboard', () => {
    render(<WaterQuality />);

    expect(screen.getByRole('link', { name: /view water quality dashboard/i })).toHaveAttribute('href', '/waterquality');
  });

  it('keeps the indication caveat visible without implying the water is safe', () => {
    render(<WaterQuality />);

    expect(screen.getByText(/not a test of the water or a safe\/unsafe verdict/i)).toBeInTheDocument();
  });
});
