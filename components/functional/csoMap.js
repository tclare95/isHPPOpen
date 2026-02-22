import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Badge from "react-bootstrap/Badge";

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(mod => mod.Popup), { ssr: false });

const center = [52.94576790782451, -1.0907147684529286];

export default function WaterQualityMap() {
  const [waterQualityData, setWaterQualityData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [csoDetails, setCsoDetails] = useState({});
  const [icons, setIcons] = useState({
    active: null,
    inactive: null,
  });

  useEffect(() => {
    let ignore = false;

    const initializeIcons = async () => {
      try {
        const leafletModule = await import("leaflet");
        const { Icon } = leafletModule;

        if (ignore) return;

        setIcons({
          active: new Icon({
            iconUrl: "/red-marker-icon.png",
            iconSize: [25, 25],
            iconAnchor: [12, 25],
          }),
          inactive: new Icon({
            iconUrl: "/grey-marker-icon.png",
            iconSize: [25, 25],
            iconAnchor: [12, 25],
          }),
        });
      } catch (iconError) {
        if (!ignore) {
          console.error("Failed to initialize map icons", iconError);
        }
      }
    };

    const fetchWaterQualityData = async () => {
      try {
        const response = await fetch("/api/waterquality");
        if (!response.ok) {
          throw new Error(`Water quality request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const data = payload?.ok === true ? payload.data : payload;
        const latest = data?.waterQualityData ?? null;
        if (!latest) {
          throw new Error("Water quality payload missing data");
        }

        if (ignore) return;
        setWaterQualityData(latest);

        const ids = Array.isArray(latest?.WaterQuality?.CSOIds)
          ? latest.WaterQuality.CSOIds.filter(Boolean)
          : [];

        if (!ids.length) {
          return;
        }

        try {
          const bulkRes = await fetch(`/api/waterquality/cso?ids=${ids.join(",")}`);
          if (!bulkRes.ok) {
            throw new Error(`Bulk CSO request failed with status ${bulkRes.status}`);
          }

          const bulkPayload = await bulkRes.json();
          const bulkJson = bulkPayload?.ok === true ? bulkPayload.data : bulkPayload;
          if (!ignore) {
            setCsoDetails(bulkJson?.csoData || {});
          }
        } catch (bulkError) {
          console.error("Failed to fetch bulk CSO data", bulkError);
        }
      } catch (fetchError) {
        if (!ignore) {
          console.error("Failed to fetch map water quality data", fetchError);
          setError("Unable to load map data right now.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    initializeIcons();
    fetchWaterQualityData();

    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) {
    return <p>Loading map data...</p>;
  }

  if (error) {
    return <p>{error}</p>;
  }

  if (!waterQualityData) {
    return <p>No map data available.</p>;
  }

  const activeCSOs = new Set(Array.isArray(waterQualityData.ActiveCSOIds) ? waterQualityData.ActiveCSOIds : []);
  const csoIds = Array.isArray(waterQualityData?.WaterQuality?.CSOIds)
    ? waterQualityData.WaterQuality.CSOIds
    : [];

  if (!csoIds.length) {
    return <p>No recent CSO locations found.</p>;
  }

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

      {csoIds.map((id) => {
        const position = csoLocation(id);
        const activeTime = calculateActiveTime(csoDetails[id]);
        return (
          <Marker
            key={id}
            position={position}
            icon={activeCSOs.has(id) ? icons.active : icons.inactive}
          >
            <Popup>
              <div className="text-center">
                <strong>CSO ID: {id}</strong>
                <br />
                Status:{' '}
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
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return "N/A";
    }
    const diffMs = end - start;
    const diffMins = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    return `${hours} hrs ${minutes} mins`;
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) return "N/A";
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
  }
}