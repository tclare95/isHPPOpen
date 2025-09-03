import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Badge from "react-bootstrap/Badge";

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(mod => mod.Popup), { ssr: false });

const center = [52.94576790782451, -1.0907147684529286];

let activeCsoIcon, inactiveIcon;
if (typeof window !== "undefined") {
  const { Icon } = require("leaflet");
  require("leaflet/dist/leaflet.css");

  activeCsoIcon = new Icon({
    iconUrl: "/red-marker-icon.png",
    iconSize: [25, 25],
    iconAnchor: [12, 25],
  });

  inactiveIcon = new Icon({
    iconUrl: "/grey-marker-icon.png",
    iconSize: [25, 25],
    iconAnchor: [12, 25],
  });

}

export default function WaterQualityMap() {
  const [isClient, setIsClient] = useState(false);
  const [waterQualityData, setWaterQualityData] = useState(null);
  const [csoDetails, setCsoDetails] = useState({});

  useEffect(() => {
    setIsClient(true);
    fetch("/api/waterquality")
      .then(response => response.json())
      .then(data => {
        setWaterQualityData(data.waterQualityData);
        const ids = data.waterQualityData.WaterQuality.CSOIds;
        if (Array.isArray(ids) && ids.length > 0) {
          const query = encodeURIComponent(ids.join(','));
          fetch(`/api/waterquality/cso?ids=${query}`)
            .then(response => response.json())
            .then(details => {
              setCsoDetails(details);
            });
        }
      });
  }, []);

  if (!isClient || !waterQualityData) {
    return null;
  }

  const activeCSOs = new Set(waterQualityData.ActiveCSOIds);

  return (
    <MapContainer
      center={center}
      zoom={10}
      style={{ height: "400px", width: "100%", borderRadius: "10px", overflow: "hidden" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {waterQualityData.WaterQuality.CSOIds.filter(id => csoDetails[id]).map((id) => {
        const position = csoLocation(id);
        const activeTime = calculateActiveTime(csoDetails[id]);
        return (
          <Marker
            key={id}
            position={position}
            icon={activeCSOs.has(id) ? activeCsoIcon : inactiveIcon}
          >
            <Popup>
              <div className="text-center">
                <strong>CSO ID: {id}</strong>
                <br />
                Status:{" "}
                {activeCSOs.has(id) ? (
                  <Badge bg="danger">Currently Active</Badge>
                ) : (
                  <Badge bg="warning">Active in last 48 hours</Badge>
                )}
                <br />
                Active Time: {activeTime}
                <br />
                <small className="text-muted">
                  Spill start: {formatTimestamp(csoDetails[id]?.LatestEventStart)}
                  <br />
                  Spill end: {formatTimestamp(csoDetails[id]?.LatestEventEnd)}
                </small>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );

  function csoLocation(csoId) {
    const location = csoDetails[csoId]?.Coordinates;
    return location ? [location.y, location.x] : center; // fallback to center
  }

  function calculateActiveTime(details) {
    if (!details) return "N/A";
    const start = new Date(details.LatestEventStart);
    const end = details.LatestEventEnd ? new Date(details.LatestEventEnd) : new Date();
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    return `${hours} hrs ${minutes} mins`;
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  }
}
