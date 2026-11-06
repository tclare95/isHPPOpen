import { fireEvent, render, screen } from '@testing-library/react';
import RiverContext from '../components/functional/riverContext';
import fixture from '../libs/rdp/fixtures/hpp-river.json';

const context = (direction = 'upstream') => ({ direction, geometry: 'reaches', location: fixture.locate.data, trace: fixture[direction] });

test('direction switching is accessible and network text preserves catchment/source qualifications', () => {
  const change = jest.fn();
  const { rerender } = render(<RiverContext direction="upstream" onDirectionChange={change} context={context()} />);
  expect(screen.getByText(/7,481.745/)).toHaveTextContent('100.1 m downstream');
  expect(screen.getByText(/71 m downstream/)).toHaveTextContent('does not measure contamination');
  expect(screen.getByText(fixture.upstream.riverTracer.attribution)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Explore the river at Holme Pierrepont'), { target: { value: 'downstream' } });
  expect(change).toHaveBeenCalledWith('downstream');
  const downstream = context('downstream');
  downstream.geometry = 'none';
  downstream.trace = JSON.parse(JSON.stringify(downstream.trace));
  downstream.trace.riverTracer.route.completeness = 'incomplete';
  downstream.trace.riverTracer.route.reasons = ['dead-end'];
  rerender(<RiverContext direction="downstream" onDirectionChange={change} context={downstream} />);
  expect(screen.getByText(/Partial route: dead-end/)).toBeInTheDocument();
  expect(screen.getByText(/Summary only/)).toBeInTheDocument();
});

test('loading, errors and uncertain matches leave a usable text alternative', () => {
  const props = { direction: 'upstream', onDirectionChange: jest.fn() };
  const { rerender } = render(<RiverContext {...props} isPending />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  rerender(<RiverContext {...props} error={new Error('private RDP error')} />);
  expect(screen.getByRole('status')).toHaveTextContent('unavailable');
  expect(screen.queryByText('private RDP error')).not.toBeInTheDocument();
  rerender(<RiverContext {...props} context={{ direction: 'upstream', status: 'Ambiguous', trace: null }} />);
  expect(screen.getByRole('status')).toHaveTextContent('could not be matched confidently');
});
