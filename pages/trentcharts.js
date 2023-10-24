import Link from "next/link";
import { Col, Container, Row } from "react-bootstrap";
import Meta from "../components/meta";
import TrentWeirBlock from "../components/functional/trentWeir";
import MultiMeasureChart from "../components/functional/multimeasurechart";

export default function TrentWeirs() {
  return (
    <Container fluid className="bg-dark">
      <Meta title="Trent Weir Dashboard" />
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Gauge Dashboard</h1>
            <Link href="/trentweirs">
              <h2 className="navHeader">← Back to trent gauge dashboard</h2>
            </Link>
          </Col>
        </Row>
        <MultiMeasureChart
          stations={[
            { id: 4126, name: "Clifton Bridge" },
            { id: 4009, name: "Colwick" },
            { id: 4067, name: "Church Wilne" },
            { id: 4007, name: "Shardlow" },
          ]}
        />
      </Container>
    </Container>
  );
}
