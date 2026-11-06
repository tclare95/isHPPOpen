import PropTypes from 'prop-types';

const readable = (text) => text?.replaceAll('->', '→').replaceAll('<-', '←');
const km = (metres) => (metres / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });

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
          : <>
            <p className="mb-1"><strong>{direction === 'upstream' ? 'Upstream of HPP' : 'Downstream of HPP'}:</strong> {readable(trace.summary.mainStem || trace.summary.text)}</p>
            <p className="mb-1">{km(trace.route.lengthM)} km of mapped {direction === 'upstream' ? 'river network' : 'route'}. {trace.route.completeness === 'complete' ? 'Mapped connections are complete.' : `Partial route: ${trace.route.reasons.join(', ')}.`}</p>
            {context.geometry === 'none' ? <p className="mb-1">Summary only; river geometry is unavailable for this view.</p> : <p className="mb-1">River lines are blue; the source catchment, where available, is purple.</p>}
            {trace.catchment?.status === 'published' ? <p className="mb-1">Source catchment: {trace.catchment.areaKm2.toLocaleString()} km². Its pour point is {trace.catchment.pourPointOffsetM.toLocaleString()} m downstream of the route sample.</p>
              : direction === 'upstream' ? <p className="mb-1">A published catchment is unavailable for this view.</p> : null}
            <p className="mb-1">The route starts at a mapped Trent sample {context.location.sample.snapOffsetM} m downstream of the HPP anchor. Connectivity does not measure contamination, travel time or water safety.</p>
            {trace.summary.namedRivers?.length ? <details className="mb-2"><summary>Named upstream rivers ({trace.summary.namedRiverCount} in the mapped network)</summary>
              <ul>{trace.summary.namedRivers.map((river, index) => <li key={`${river.name}-${index}`}>{river.name}{river.flowsInto ? ` → ${river.flowsInto}` : ''}</li>)}</ul>
              {trace.summary.namedRiverCount > trace.summary.namedRivers.length ? <p>Showing the {trace.summary.namedRivers.length} largest named branches supplied by the source.</p> : null}
            </details> : null}
            <details><summary>River data source and limitations</summary>
              <p>{trace.attribution}</p><p>{trace.network.dataset} — {trace.network.release}</p>
              <p className="text-break">Network version: {trace.network.version}<br />Release version: {trace.releaseVersion}</p>
              <p>{trace.licence}</p><ul>{trace.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
            </details>
          </>}
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
