import Link from "next/link";
import { Col, Container, Row } from "react-bootstrap";
import Header from "../components/layout/frontpage/header";
import Meta from "../components/meta";
import TrentWeirBlock from "../components/functional/trentWeir";
import MultiMeasureChart from "../components/functional/multimeasurechart";
import { Button } from "react-bootstrap";

export default function TrentWeirs() {
  return (
    <Container fluid className="bg-dark">
      <Meta title="Trent Weir Dashboard" />
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Gauge Dashboard</h1>
            <Link href="/">
              <h2 className="navHeader">← Back to Main Page</h2>
            </Link>
          </Col>
        </Row>
        <Row className="mb-5">
          <TrentWeirBlock gaugeId={4009} gaugeName="Colwick" />
          <TrentWeirBlock gaugeId={4126} gaugeName="Clifton Bridge" />
          <TrentWeirBlock gaugeId={4007} gaugeName="Shardlow" />
          <TrentWeirBlock gaugeId={4067} gaugeName="Church Wilne" />
          <TrentWeirBlock gaugeId={4074} gaugeName="Kegworth" measureType="level"/>
          <TrentWeirBlock
            gaugeId={4007}
            gaugeName="Shardlow (Flow)"
            measureType="flow"
          />
        </Row>
        <Button variant="primary" size="lg" className="mb-5" href="/trentcharts">
          All in one charts
        </Button>
      </Container>
    </Container>
  );
}
