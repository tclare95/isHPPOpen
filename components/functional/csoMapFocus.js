import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import PropTypes from 'prop-types';

// Moves the map to an outfall chosen from the spill history (#121). Rendered inside MapContainer only.
export default function CsoMapFocus({ latitude, longitude }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) map.flyTo([latitude, longitude], Math.max(map.getZoom(), 13));
  }, [map, latitude, longitude]);
  return null;
}

CsoMapFocus.propTypes = { latitude: PropTypes.number, longitude: PropTypes.number };
