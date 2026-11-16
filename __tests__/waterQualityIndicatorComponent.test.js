import { render, screen } from '@testing-library/react';
import WaterQualityIndicator from '../components/functional/vomitfactor';
import { assessmentRows, levelHours } from '../components/functional/waterQualityAssessmentChart';

describe('WaterQualityIndicator', () => {
  test('renders the server assessment, including "at least" and partial data', () => {
    render(<WaterQualityIndicator expanded assessment={{ level: 'elevated', label: 'Elevated', atLeast: true, partial: true, reasons: ['20 of 592 spilled.', 'River steady.'] }} />);
    expect(screen.getByText('At least elevated')).toBeInTheDocument();
    expect(screen.getByText(/partial data/)).toBeInTheDocument();
    expect(screen.getByText('20 of 592 spilled.')).toBeInTheDocument();
    expect(screen.getByText('River steady.')).toBeInTheDocument();
  });

  test('no assessment is shown as unavailable, never as a level', () => {
    render(<WaterQualityIndicator assessment={null} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  test('pending without data says so', () => {
    render(<WaterQualityIndicator isPending />);
    expect(screen.getByText('Loading indication…')).toBeInTheDocument();
  });
});

describe('assessment chart rows', () => {
  const points = [
    { at: '2026-11-16T10:00:00Z', level: 'unavailable', csoLevel: 'unavailable', recent: { min: 2, max: 500 }, spillingNow: { min: 0, max: 500 } },
    { at: '2026-11-16T11:00:00Z', level: 'elevated', csoLevel: 'elevated', recent: { min: 20, max: 22 }, spillingNow: { min: 1, max: 3 } },
  ];
  test('hours without enough evidence are gaps, not zero', () => {
    expect(assessmentRows(points)).toEqual([
      [new Date('2026-11-16T10:00:00Z'), null, null, null, null],
      [new Date('2026-11-16T11:00:00Z'), 20, 20, 22, 1],
    ]);
    expect(levelHours(points)).toEqual({ unavailable: 1, elevated: 1 });
  });
});
