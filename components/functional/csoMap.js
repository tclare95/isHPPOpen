import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Form from 'react-bootstrap/Form';
import PropTypes from 'prop-types';
import { membershipText } from '../../libs/csoMembershipText';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false });
const GeoJSON = dynamic(() => import('react-leaflet').then((mod) => mod.GeoJSON), { ssr: false });
const MarkerClusterGroup = dynamic(() => import('react-leaflet-cluster').then((mod) => mod.default), { ssr: false });
const MapFocus = dynamic(() => import('./csoMapFocus'), { ssr: false });
const center = [52.9458, -1.0907];
const WINDOWS = [{ label: 'Current', hours: 0 }, { label: '6 hours', hours: 6 }, { label: '24 hours', hours: 24 }, { label: '48 hours', hours: 48 }];

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatTimestamp(value) {
  return validDate(value)?.toLocaleString() || 'Not available';
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return 'Not available';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

const STATUS_BADGE = { active: ['danger', 'Currently spilling'], recent: ['warning', 'Stopped recently'] };
// RDP relationship categories outside the confirmed upstream membership (#114). Plotted only on request, always labelled.
export const RELATIONSHIP_LABELS = {
  candidate: 'Possibly upstream: river link not confirmed',
  'catchment-only': 'In the catchment: river link unresolved',
};
const isPossible = (location) => Boolean(RELATIONSHIP_LABELS[location?.relationship?.category]);

function inWindow(location, windowHours, now, focusId) {
  const latitude = Number(location?.coordinates?.y);
  const longitude = Number(location?.coordinates?.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (location.status === 'active' || location.id === focusId) return true;
  if (location.status !== 'recent' || windowHours === 0) return false;
  const ended = validDate(location.latestEventEnd);
  return Boolean(ended && ended >= new Date(now.getTime() - windowHours * 60 * 60 * 1000));
}

export default function WaterQualityMap({ locations = [], relatedLocations = null, membership = null, health, isPending = false, error = null, now = new Date(), riverTrace = null, focusId = null, onShowHistory = null }) {
  const [windowHours, setWindowHours] = useState(6);
  const [showRelated, setShowRelated] = useState(false);
  const [icons, setIcons] = useState({});
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then(({ divIcon }) => {
      if (cancelled) return;
      const icon = (kind, symbol) => divIcon({ className: `cso-marker cso-marker--${kind}`, html: `<span aria-hidden="true">${symbol}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      setIcons({ active: icon('active', '!'), recent: icon('recent', '≈'),
        possibleActive: icon('active cso-marker--possible', '?'), possibleRecent: icon('recent cso-marker--possible', '?') });
    }).catch(() => setIcons({}));
    return () => { cancelled = true; };
  }, []);
  const filtered = useMemo(() => locations.filter((location) => inWindow(location, windowHours, now, focusId)), [locations, now, windowHours, focusId]);
  const related = useMemo(() => (showRelated ? (relatedLocations?.locations ?? []).filter((location) => inWindow(location, windowHours, now, null)) : []),
    [relatedLocations, showRelated, now, windowHours]);
  const focused = filtered.find((location) => location.id === focusId) ?? null;
  const relatedCounts = relatedLocations?.categories ?? null;
  const relatedActivity = relatedCounts ? Object.values(relatedCounts).reduce((sum, entry) => sum + entry.currentlySpilling + entry.recentlyStopped48h, 0) : 0;
  const plotted = [...filtered, ...related];
  const markerIcon = (location) => (isPossible(location)
    ? icons[location.status === 'active' ? 'possibleActive' : 'possibleRecent'] : icons[location.status]) || undefined;
  const membershipNote = membershipText(membership);

  if (isPending) return <p>Loading map data…</p>;
  if (error) return <p>Unable to load map data right now.</p>;
  const hasRiverGeometry = Boolean(riverTrace?.features?.length);
  if (!locations.length && !hasRiverGeometry) return <><p>No CSO location data is available.</p>{membershipNote ? <p className="small water-quality-muted mb-0">{membershipNote}</p> : null}</>;
  return (
    <div>
      {health?.cso?.available === false ? <div className="alert alert-warning py-2">Current status is unavailable. No location is labelled as currently spilling or as clear.</div>
        : health?.state !== 'fresh' ? <div className="alert alert-warning py-2">Status data may be stale. No stale location is labelled as currently spilling.</div> : null}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <ButtonGroup size="sm" aria-label="Recent spill window">
          {WINDOWS.map((option) => <Button key={option.hours} variant={windowHours === option.hours ? 'info' : 'outline-light'} onClick={() => setWindowHours(option.hours)}>{option.label}</Button>)}
        </ButtonGroup>
        <div className="cso-map-legend"><span className="legend-active" aria-hidden="true">!</span> Currently spilling <span className="legend-recent" aria-hidden="true">≈</span> Stopped recently; flow remains downstream{showRelated ? <> <span className="legend-possible" aria-hidden="true">?</span> Not confirmed upstream</> : null}</div>
      </div>
      {relatedCounts ? (
        <Form.Check type="switch" id="cso-map-related" className="small mb-2" checked={showRelated} onChange={(e) => setShowRelated(e.target.checked)}
          label={`Also show outfalls that may be upstream but are not confirmed (${relatedActivity} with current or recent activity)`} />
      ) : null}
      {!plotted.length && !hasRiverGeometry ? <p className="water-quality-muted">No locations match this time window.</p> : (
        <MapContainer center={center} zoom={9} preferCanvas className="cso-map" aria-label="Upstream CSO activity map">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {hasRiverGeometry ? <GeoJSON key={`${riverTrace.riverTracer.releaseVersion}-${riverTrace.riverTracer.kind}`}
            data={riverTrace} attribution="River network and catchment: OpenRiversNetwork"
            filter={(feature) => feature.geometry.type !== 'Point'}
            style={(feature) => feature.properties.kind === 'catchment' ? { color: '#a78bfa', weight: 1, fillOpacity: 0.08 } : { color: '#0dcaf0', weight: 3, opacity: 0.75 }} /> : null}
          {focused ? <MapFocus latitude={focused.coordinates.y} longitude={focused.coordinates.x} /> : null}
          <MarkerClusterGroup chunkedLoading>
            {plotted.map((location) => (
              <Marker key={location.assetId ?? location.id} position={[location.coordinates.y, location.coordinates.x]} icon={markerIcon(location)}>
                <Popup>
                  <div>
                    <strong>{location.receivingWaterCourse || `CSO ${location.id}`}</strong><br />
                    <small>{location.id}</small><br />
                    <Badge bg={(STATUS_BADGE[location.status] ?? ['secondary'])[0]}>{(STATUS_BADGE[location.status] ?? [null, 'Selected from spill history'])[1]}</Badge><br />
                    {isPossible(location) ? <><Badge bg="dark" className="border">{RELATIONSHIP_LABELS[location.relationship.category]}</Badge><br /></> : null}
                    Spill start: {formatTimestamp(location.latestEventStart)}<br />
                    Spill end: {location.status === 'active' ? 'Ongoing' : formatTimestamp(location.latestEventEnd)}<br />
                    Duration: {formatDuration(location.eventDurationMinutes)}<br />
                    <small>Last checked: {formatTimestamp(location.observedAt)}</small>
                    {onShowHistory && !isPossible(location) ? <><br /><Button size="sm" variant="link" className="p-0" onClick={() => onShowHistory(location.id)}>Spill history for this outfall</Button></> : null}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      )}
      <p className="small water-quality-muted mt-2 mb-0">Showing {filtered.length} locations{related.length ? ` and ${related.length} not confirmed upstream` : ''}. Locations with offline, stale or unknown status are counted above but are not plotted.</p>
      {membershipNote ? <p className="small water-quality-muted mt-1 mb-0">{membershipNote}</p> : null}
    </div>
  );
}

WaterQualityMap.propTypes = {
  locations: PropTypes.array,
  relatedLocations: PropTypes.shape({ categories: PropTypes.object, locations: PropTypes.array }),
  membership: PropTypes.object,
  health: PropTypes.shape({ state: PropTypes.string, cso: PropTypes.shape({ available: PropTypes.bool }) }),
  isPending: PropTypes.bool,
  error: PropTypes.object,
  now: PropTypes.instanceOf(Date),
  riverTrace: PropTypes.object,
  focusId: PropTypes.string,
  onShowHistory: PropTypes.func,
};
