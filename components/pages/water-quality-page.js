'use client';

import Link from 'next/link';
import { Col, Container, Row } from 'react-bootstrap';
import WaterQualityMap from '../functional/csoMap';
import CsoChart from '../functional/csoChart';

export default function WaterQualityPage({ currentData }) {
  return (
    <Container fluid className="bg-dark">
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Water Quality Dashboard</h1>
            <Link href="/">
              <h2 className="navHeader">← Back to home</h2>
            </Link>
          </Col>
        </Row>
        <Row className="mb-5">
          <Col>
            <h2>About Water Quality Monitoring</h2>
            <p>
              Severn Trent provide live data for Combined Sewage Overflow (CSO&apos;s) in the Trent Catchment. This
              data can help inform water quality for HPP. It&apos;s important to understand the limitations of this data -
              it does not include information about the volume of spills - just if a CSO is releasing or not. This
              also doesn&apos;t give any information about sources of pollution that are part of Severn Trent&apos;s system -
              agricultural runoff, unregulated systems etc.
            </p>
          </Col>
        </Row>
        <Row className="mb-5">
          <Col>
            <h2>CSO Map</h2>
            <WaterQualityMap />
          </Col>
        </Row>
        <Row className="mb-5">
          <Col>
            <h2>CSO Density Chart</h2>
            <CsoChart />
          </Col>
        </Row>
        <Row className="mb-5">
          <Col>
            <h2>Current Data</h2>
            {currentData ? (
              <>
                <p>Number of currently active CSOs: {currentData.ActiveCSOCount}</p>
                <p>Number of CSO&apos;s active in past 48 hours: {currentData.WaterQuality.NumberUpstreamCSOs}</p>
                <p>Total discharge time (last 48 hours): {currentData.WaterQuality.CSOActiveTime} hours</p>
                <p>
                  Number of active CSO&apos;s per square kilometer: {currentData.WaterQuality.NumberCSOsPerKm2.toFixed(4)}
                </p>
              </>
            ) : (
              <p>Loading current data...</p>
            )}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
