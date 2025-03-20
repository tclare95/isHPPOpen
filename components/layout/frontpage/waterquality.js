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
              The water quality at HPP has a poor reputation. However quite a lot of the time, particularly in the summer, it is not that bad! To help judge what the quality will be like, the "traffic light" system next to the water level is based on the current river level and recent rate of change of the river. Please note this is only a rough indication—other factors may be in play when you paddle, so take sensible precautions.
              There is a new page with more detailed water quality information <Link href="/waterquality">here</Link>.
            </Accordion.Body>
          </Accordion.Item>
        </Accordion>
      </Row>

      <Row className="justify-content-center my-3">
      </Row>
    </div>
  );
}