import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import PropTypes from 'prop-types';

// "Reported downstream spill impact" (RDP live downstream impact). Display only; never feeds the indicator or alerts.
export const IMPACT_LABELS = {
  active: 'Currently spilling',
  unresolved: 'Spill end not confirmed',
  recent: 'Stopped recently',
};
export const IMPACT_CAVEAT = 'Lines show river reaches connected downstream of reported spills on the mapped river network. '
  + 'Hydrological connectivity only: they do not show pollution concentration, how long it takes to travel, or whether the water is safe.';
const STYLES = {
  active: { color: '#dc3545', weight: 4, opacity: 0.9 },
  unresolved: { color: '#fd7e14', weight: 3, opacity: 0.85, dashArray: '6 6' },
  recent: { color: '#ffc107', weight: 3, opacity: 0.8 },
};

export const contributorsOf = (feature) => Object.values(feature?.properties?.contributors ?? {}).flat();

// With an outfall selected, its reaches are emphasised and every other reach fades; nothing is hidden.
export function impactReachStyle(feature, selectedId) {
  const base = STYLES[feature?.properties?.impact] ?? STYLES.recent;
  if (!selectedId) return base;
  return contributorsOf(feature).includes(selectedId) ? { ...base, weight: base.weight + 3, opacity: 1 } : { ...base, weight: 2, opacity: 0.2 };
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : 'Not available';
}

function eventEnd(event) {
  if (!event) return 'Not available';
  if (event.lifecycle === 'ongoing') return 'Ongoing';
  if (event.lifecycle === 'unresolved') return event.endNoLaterThan ? `Not reported (no later than ${formatTime(event.endNoLaterThan)})` : 'Not reported';
  return formatTime(event.endedAt);
}

export function ImpactPanel({ impact = null, isPending = false, error = null, selectedId = '', onSelect, onShowHistory = null }) {
  if (error) {
    return <p className="small water-quality-muted mt-2 mb-0" role="status">Downstream spill impact is unavailable right now. The rest of the map is unaffected.</p>;
  }
  if (isPending) return <p className="small water-quality-muted mt-2 mb-0">Loading downstream spill impact…</p>;
  if (!impact) return null;
  const { counts, outfalls } = impact;
  const selected = outfalls.find((outfall) => outfall.assetId === selectedId) ?? null;
  const unknown = counts.unknown;
  return (
    <div className="cso-impact-panel mt-2" aria-live="polite">
      <p className="small mb-1"><strong>Reported downstream spill impact.</strong> {IMPACT_CAVEAT}</p>
      <div className="cso-map-legend mb-1">
        <span className="legend-impact legend-impact--active" aria-hidden="true" /> {IMPACT_LABELS.active}
        <span className="legend-impact legend-impact--unresolved" aria-hidden="true" /> {IMPACT_LABELS.unresolved}
        <span className="legend-impact legend-impact--recent" aria-hidden="true" /> {IMPACT_LABELS.recent}
      </div>
      <p className="small water-quality-muted mb-1">
        {counts.active} spilling, {counts.unresolved} with an unconfirmed end and {counts.recent} stopped recently.
        {unknown ? ` ${unknown} upstream outfalls have no usable current status; their routes are not drawn, and they are not assumed clear.` : ''}
        {impact.unroutedDrawnOutfalls.length ? ` ${impact.unroutedDrawnOutfalls.length} reported outfalls could not be linked to a river reach and are not drawn.` : ''}
        {impact.statusPartial ? ' Some status reads failed; those outfalls are shown as unknown.' : ''}
      </p>
      {outfalls.length ? (
        <Form.Group controlId="cso-impact-outfall" className="mb-1">
          <Form.Label className="small mb-0">Highlight one reported spill&apos;s downstream route</Form.Label>
          <Form.Select size="sm" value={selectedId} onChange={(e) => onSelect(e.target.value)}>
            <option value="">All reported spills</option>
            {outfalls.map((outfall) => (
              <option key={outfall.assetId} value={outfall.assetId}>
                {outfall.externalId}: {IMPACT_LABELS[outfall.impact]}{outfall.latestEvent ? `, started ${formatTime(outfall.latestEvent.startedAt)}` : ''}{outfall.routed ? '' : ' (not drawn)'}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      ) : <p className="small water-quality-muted mb-1">No reported spill in the last {impact.windowHours} hours has a drawable downstream route.</p>}
      {selected ? (
        <div className="small cso-impact-selected">
          <strong>{selected.externalId}</strong>: {IMPACT_LABELS[selected.impact]}<br />
          {selected.latestEvent ? <>Spill {selected.latestEvent.eventId}: started {formatTime(selected.latestEvent.startedAt)}, ended {eventEnd(selected.latestEvent)}<br /></> : null}
          Status last checked: {formatTime(selected.statusFetchedAt)}<br />
          {selected.route
            ? <>Route: {(selected.route.lengthM / 1000).toFixed(1)} km over {selected.route.reachCount} reaches{selected.route.completeness === 'complete' ? ', to the river mouth' : ' (incomplete: the mapped network ends or branches before the sea)'}<br /></>
            : <>No downstream route is drawn for this outfall.<br /></>}
          {onShowHistory ? <Button size="sm" variant="link" className="p-0" onClick={() => onShowHistory(selected.externalId)}>Spill history for this outfall</Button> : null}
        </div>
      ) : null}
      <p className="small water-quality-muted mt-1 mb-0">
        As of {formatTime(impact.asOf)}. Relationship set {impact.relationships.setId} ({impact.relationships.version.slice(0, 12)}), network {impact.network.release}.
        {' '}{impact.attribution}
      </p>
    </div>
  );
}

const outfallShape = PropTypes.shape({ assetId: PropTypes.string, externalId: PropTypes.string, impact: PropTypes.string });
ImpactPanel.propTypes = {
  impact: PropTypes.shape({
    asOf: PropTypes.string, windowHours: PropTypes.number, counts: PropTypes.object, outfalls: PropTypes.arrayOf(outfallShape),
    unroutedDrawnOutfalls: PropTypes.array, statusPartial: PropTypes.bool, relationships: PropTypes.object, network: PropTypes.object,
    attribution: PropTypes.string, reaches: PropTypes.object,
  }),
  isPending: PropTypes.bool,
  error: PropTypes.object,
  selectedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onShowHistory: PropTypes.func,
};
