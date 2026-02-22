"use client";

import Link from "next/link";
import { Col, Container, Row } from "react-bootstrap";
import MultiMeasureChart from "../../components/functional/multimeasurechart";

export default function TrentChartsPage() {
  return (
    <Container fluid className="bg-dark">
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Gauge Dashboard</h1>
            <Link href="/trentweirs" className="navHeader">← Back to trent gauge dashboard</Link>
          </Col>
        </Row>
        <MultiMeasureChart
          stations={[
            { id: 4126, name: "Clifton Bridge" },
            { id: 4009, name: "Colwick" },
            { id: 4067, name: "Church Wilne" },
            { id: 4007, name: "Shardlow" },
            { id: 4074, name: "Kegworth", measureType: "level" },
          ]}
        />
      </Container>
    </Container>
  );
}
