import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import PropTypes from 'prop-types';

const MapContainer = dynamic(() => import('react-leaflet').then((mod) => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then((mod) => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then((mod) => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then((mod) => mod.Popup), { ssr: false });
const MarkerClusterGroup = dynamic(() => import('react-leaflet-cluster').then((mod) => mod.default), { ssr: false });
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

export default function WaterQualityMap({ locations = [], health, isPending = false, error = null, now = new Date() }) {
  const [windowHours, setWindowHours] = useState(6);
  const [icons, setIcons] = useState({ active: null, recent: null });
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then(({ divIcon }) => {
      if (cancelled) return;
      const icon = (kind, symbol) => divIcon({ className: `cso-marker cso-marker--${kind}`, html: `<span aria-hidden="true">${symbol}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      setIcons({ active: icon('active', '!'), recent: icon('recent', '≈') });
    }).catch(() => setIcons({ active: null, recent: null }));
    return () => { cancelled = true; };
  }, []);
  const filtered = useMemo(() => locations.filter((location) => {
    const latitude = Number(location?.coordinates?.y);
    const longitude = Number(location?.coordinates?.x);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (location.status === 'active') return true;
    if (location.status !== 'recent' || windowHours === 0) return false;
    const ended = validDate(location.latestEventEnd);
    return ended && ended >= new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  }), [locations, now, windowHours]);

  if (isPending) return <p>Loading map data…</p>;
  if (error) return <p>Unable to load map data right now.</p>;
  if (!locations.length) return <p>No CSO location data is available.</p>;
  return (
    <div>
      {health?.state !== 'fresh' ? <div className="alert alert-warning py-2">Status data may be stale. No stale location is labelled as currently spilling.</div> : null}
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <ButtonGroup size="sm" aria-label="Recent spill window">
          {WINDOWS.map((option) => <Button key={option.hours} variant={windowHours === option.hours ? 'info' : 'outline-light'} onClick={() => setWindowHours(option.hours)}>{option.label}</Button>)}
        </ButtonGroup>
        <div className="cso-map-legend"><span className="legend-active" aria-hidden="true">!</span> Currently spilling <span className="legend-recent" aria-hidden="true">≈</span> Stopped recently; flow remains downstream</div>
      </div>
      {!filtered.length ? <p className="water-quality-muted">No locations match this time window.</p> : (
        <MapContainer center={center} zoom={9} className="cso-map" aria-label="Upstream CSO activity map">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MarkerClusterGroup chunkedLoading>
            {filtered.map((location) => (
              <Marker key={location.id} position={[location.coordinates.y, location.coordinates.x]} icon={icons[location.status] || undefined}>
                <Popup>
                  <div>
                    <strong>{location.receivingWaterCourse || `CSO ${location.id}`}</strong><br />
                    <small>{location.id}</small><br />
                    <Badge bg={location.status === 'active' ? 'danger' : 'warning'}>{location.status === 'active' ? 'Currently spilling' : 'Stopped recently'}</Badge><br />
                    Spill start: {formatTimestamp(location.latestEventStart)}<br />
                    Spill end: {location.status === 'active' ? 'Ongoing' : formatTimestamp(location.latestEventEnd)}<br />
                    Duration: {formatDuration(location.eventDurationMinutes)}<br />
                    <small>Last checked: {formatTimestamp(location.observedAt)}</small>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      )}
      <p className="small water-quality-muted mt-2 mb-0">Showing {filtered.length} locations. Locations with offline, stale or unknown status are counted above but are not plotted.</p>
    </div>
  );
}

WaterQualityMap.propTypes = {
  locations: PropTypes.array,
  health: PropTypes.shape({ state: PropTypes.string }),
  isPending: PropTypes.bool,
  error: PropTypes.object,
  now: PropTypes.instanceOf(Date),
};
