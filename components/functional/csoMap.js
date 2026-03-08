import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Badge from "react-bootstrap/Badge";
import useFetch from "../../libs/useFetch";
import { SWR_15_MINUTES } from "../../libs/dataFreshness";

const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(mod => mod.Popup), { ssr: false });

const center = [52.94576790782451, -1.0907147684529286];

function csoLocation(csoDetails, csoId) {
  const location = csoDetails[csoId]?.Coordinates;
  return location ? [location.y, location.x] : center;
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

export default function WaterQualityMap() {
  const [icons, setIcons] = useState({
    active: null,
    inactive: null,
  });
  const { data, error: waterQualityError, isPending: waterQualityPending } = useFetch(
    "/api/waterquality",
    SWR_15_MINUTES
  );
  const waterQualityData = data?.waterQualityData ?? null;
  const csoIds = useMemo(
    () => (Array.isArray(waterQualityData?.WaterQuality?.CSOIds) ? waterQualityData.WaterQuality.CSOIds.filter(Boolean) : []),
    [waterQualityData]
  );
  const shouldFetchCsoDetails = csoIds.length > 0;
  const csoDetailsPath = shouldFetchCsoDetails
    ? `/api/waterquality/cso?ids=${csoIds.join(",")}`
    : null;
  const {
    data: csoDetailsData,
    isPending: csoDetailsPending,
  } = useFetch(csoDetailsPath, SWR_15_MINUTES);
  const csoDetails = csoDetailsData?.csoData ?? {};

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
      } catch {
        if (!ignore) {
          setIcons({ active: null, inactive: null });
        }
      }
    };

    initializeIcons();

    return () => {
      ignore = true;
    };
  }, []);

  const isLoading = waterQualityPending || (shouldFetchCsoDetails && csoDetailsPending);

  if (isLoading) {
    return <p>Loading map data...</p>;
  }

  if (waterQualityError) {
    return <p>Unable to load map data right now.</p>;
  }

  if (!waterQualityData) {
    return <p>No map data available.</p>;
  }

  const activeCSOs = new Set(Array.isArray(waterQualityData.ActiveCSOIds) ? waterQualityData.ActiveCSOIds : []);

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
        const position = csoLocation(csoDetails, id);
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
}