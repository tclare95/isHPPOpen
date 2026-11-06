import PropTypes from 'prop-types';

export default function RiverContext({ direction, onDirectionChange, context, error, isPending }) {
  const trace = context?.direction === direction ? context.trace?.riverTracer : null;
  return (
    <div className="my-3">
      <label htmlFor="hpp-river-direction" className="form-label">Explore the river at Holme Pierrepont</label>
      <select id="hpp-river-direction" className="form-select mb-2" value={direction} onChange={(event) => onDirectionChange(event.target.value)}>
        <option value="off">River network off</option>
        <option value="upstream">Upstream rivers and catchment</option>
        <option value="downstream">Downstream towards the sea</option>
      </select>
      {direction !== 'off' ? <div aria-live="polite" className="small">
        {error ? <p role="status">River context is unavailable right now. The CSO activity view is still independent.</p>
          : isPending ? <p role="status">Loading river context…</p>
          : !trace ? <p role="status">The HPP river location could not be matched confidently. No river route is shown.</p>
          : context.geometry === 'none' ? <p role="status">River geometry is unavailable for this view.</p>
          : trace.route.completeness !== 'complete' ? <p role="status">Some river connections are missing.</p>
          : null}
      </div> : null}
    </div>
  );
}

RiverContext.propTypes = {
  direction: PropTypes.oneOf(['off', 'upstream', 'downstream']).isRequired,
  onDirectionChange: PropTypes.func.isRequired,
  context: PropTypes.object,
  error: PropTypes.object,
  isPending: PropTypes.bool,
};
