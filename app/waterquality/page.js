"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Col, Container, Row } from "react-bootstrap";
import { useEffect, useState } from "react";

const WaterQualityMap = dynamic(() => import("../../components/functional/csoMap"), {
  ssr: false,
  loading: () => <p>Loading map...</p>,
});

const CsoChart = dynamic(() => import("../../components/functional/csoChart"), {
  ssr: false,
  loading: () => <p>Loading chart...</p>,
});

export default function WaterQualityPage() {
  const [currentData, setCurrentData] = useState(null);
  const [isLoadingCurrentData, setIsLoadingCurrentData] = useState(true);
  const [currentDataError, setCurrentDataError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      try {
        const response = await fetch("/api/waterquality");
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = await response.json();
        const data = payload?.ok === true ? payload.data : payload;
        if (ignore) return;
        setCurrentData(data?.waterQualityData ?? null);
      } catch (error) {
        if (ignore) return;
        console.error("Failed to fetch water quality summary", error);
        setCurrentDataError("Unable to load current data right now.");
      } finally {
        if (!ignore) setIsLoadingCurrentData(false);
      }
    }

    fetchData();
    return () => {
      ignore = true;
    };
  }, []);

  const activeCSOCount = Number(currentData?.ActiveCSOCount);
  const numberUpstreamCSOs = Number(currentData?.WaterQuality?.NumberUpstreamCSOs);
  const csoActiveTime = Number(currentData?.WaterQuality?.CSOActiveTime);
  const numberCSOsPerKm2 = Number(currentData?.WaterQuality?.NumberCSOsPerKm2);

  const activeCSOCountDisplay = Number.isFinite(activeCSOCount) ? activeCSOCount : "N/A";
  const numberUpstreamDisplay = Number.isFinite(numberUpstreamCSOs) ? numberUpstreamCSOs : "N/A";
  const activeTimeDisplay = Number.isFinite(csoActiveTime) ? `${csoActiveTime} hours` : "N/A";
  const numberPerKm2Display = Number.isFinite(numberCSOsPerKm2) ? numberCSOsPerKm2.toFixed(4) : "N/A";

  let currentDataContent;
  if (isLoadingCurrentData) {
    currentDataContent = <p>Loading current data...</p>;
  } else if (currentDataError) {
    currentDataContent = <p>{currentDataError}</p>;
  } else if (currentData) {
    currentDataContent = (
      <>
        <p>Number of currently active CSOs: {activeCSOCountDisplay}</p>
        <p>Number of CSO&apos;s active in past 48 hours: {numberUpstreamDisplay}</p>
        <p>Total discharge time (last 48 hours): {activeTimeDisplay}</p>
        <p>Number of active CSO&apos;s per square kilometer: {numberPerKm2Display}</p>
      </>
    );
  } else {
    currentDataContent = <p>No current data available.</p>;
  }

  return (
    <Container fluid className="bg-dark">
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Water Quality Dashboard</h1>
            <Link href="/" className="navHeader">← Back to home</Link>
          </Col>
        </Row>
        <Row className="mb-5">
          <Col>
            <h2>About Water Quality Monitoring</h2>
            <p>
              Severn Trent provide live data for Combined Sewage Overflow (CSO&apos;s) in the Trent Catchment.
              This data can help inform water quality for HPP. It&apos;s important to understand the limitations
              of this data - it does not include information about the volume of spills - just if a CSO is
              releasing or not. This also doesn&apos;t give any information about sources of pollution that are
              outside Severn Trent&apos;s system - agricultural runoff, unregulated systems etc.
            </p>
          </Col>
        </Row>
        <Row className="mb-5"><Col><h2>CSO Map</h2><WaterQualityMap /></Col></Row>
        <Row className="mb-5"><Col><h2>CSO Density Chart</h2><CsoChart /></Col></Row>
        <Row className="mb-5">
          <Col>
            <h2>Current Data</h2>
            {currentDataContent}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
