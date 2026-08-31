import { useState } from "react";
import Row from "react-bootstrap/Row";
import Accordion from "react-bootstrap/Accordion";
import Link from "next/link";
export default function WaterQuality() {
  const [activeKey, setActiveKey] = useState(null);

  return (
    <div className="mt-4 text-white text-center justify-content-center" id="waterquality">
      <Row className="justify-content-center">
        <h2>Water Quality</h2>
      </Row>

      <Row className="justify-content-center my-3">
        <Accordion activeKey={activeKey} onSelect={(key) => setActiveKey(key)}>
          <Accordion.Item eventKey="0">
            <Accordion.Header>Information about HPP Water Quality</Accordion.Header>
            <Accordion.Body className="bg-secondary">
              The indicator combines recent upstream storm-overflow activity with how quickly the river is rising. It gives a general direction, not a measurement of bacteria or a safe/unsafe verdict. Other pollution sources may be present, so always take sensible precautions.
              The dashboard includes the supporting map, trends and methodology.
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Row>

      <Row className="justify-content-center mt-3 mb-4">
        <Link href="/waterquality" className="btn btn-info btn-lg water-quality-dashboard-link">
          View water quality dashboard <span aria-hidden="true">→</span>
        </Link>
      </Row>
    </div>
  );
}
