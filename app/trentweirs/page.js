"use client";

import Link from "next/link";
import { Suspense } from "react";
import Alert from "react-bootstrap/Alert";
import { Col, Container, Row } from "react-bootstrap";
import TrentDashboard from "../../components/functional/trentDashboard";

function TrentWeirsPageFallback() {
  return <Alert variant="secondary">Loading Trent dashboard…</Alert>;
}

export default function TrentWeirsPage() {
  return (
    <Container fluid className="bg-dark">
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Gauge Dashboard</h1>
            <Link href="/" className="navHeader">← Back to Main Page</Link>
          </Col>
        </Row>
        <Suspense fallback={<TrentWeirsPageFallback />}>
          <TrentDashboard />
        </Suspense>
      </Container>
    </Container>
  );
}
