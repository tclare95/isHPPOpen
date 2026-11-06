import { fireEvent, render, screen } from '@testing-library/react';
import RiverContext from '../components/functional/riverContext';
import fixture from '../libs/rdp/fixtures/hpp-river.json';

const context = (direction = 'upstream') => ({ direction, geometry: 'reaches', location: fixture.locate.data, trace: fixture[direction] });

test('direction switching stays accessible without the explanatory text block', () => {
  const change = jest.fn();
  const { container, rerender } = render(<RiverContext direction="upstream" onDirectionChange={change} context={context()} />);
  expect(screen.queryByText(/Source catchment:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Named upstream rivers/)).not.toBeInTheDocument();
  expect(screen.queryByText(fixture.upstream.riverTracer.attribution)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Explore the river at Holme Pierrepont'), { target: { value: 'downstream' } });
  expect(change).toHaveBeenCalledWith('downstream');
  const downstream = context('downstream');
  rerender(<RiverContext direction="downstream" onDirectionChange={change} context={downstream} />);
  expect(screen.queryByText(/Downstream of HPP|mapped route|River Humber|mapped Trent sample|Network version|River data source and limitations/)).not.toBeInTheDocument();
  expect(container.querySelector('details')).toBeNull();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  downstream.trace = JSON.parse(JSON.stringify(downstream.trace));
  downstream.trace.riverTracer.route.completeness = 'incomplete';
  rerender(<RiverContext direction="downstream" onDirectionChange={change} context={downstream} />);
  expect(screen.getByRole('status')).toHaveTextContent('Some river connections are missing.');
  downstream.geometry = 'none';
  rerender(<RiverContext direction="downstream" onDirectionChange={change} context={downstream} />);
  expect(screen.getByRole('status')).toHaveTextContent('River geometry is unavailable for this view.');
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
