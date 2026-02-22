"use client";

import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Header from "../../components/layout/frontpage/header";
import Link from "next/link";
import Table from "react-bootstrap/Table";
import Accordion from "react-bootstrap/Accordion";
import Footer from "../../components/layout/frontpage/footer";

export default function WorldsPage() {
  return (
    <Container fluid className="bg-dark">
      <Header message="This page will have specific information about the Nottingham Worlds 2022 - more info will be added as it is released" />
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Nottingham Worlds 2022</h1>
            <Link href="/" className="navHeader">← Back to Main Page</Link>
          </Col>
        </Row>
        <Row>
          <Col>
            <h2>Key Dates</h2>
            <p>The course is closed to the public during competition week, with disruption during training week.</p>
          </Col>
        </Row>
        <Row id="schedule" className="mt-5">
          <Col>
            <h2>Full Schedule Info</h2>
            <Accordion defaultActiveKey="0">
              <Accordion.Item eventKey="0">
                <Accordion.Header>Training Dates</Accordion.Header>
                <Accordion.Body>
                  <Table striped bordered hover size="sm" variant="dark">
                    <thead><tr><th>Date</th><th>Times course open for public paddling</th><th>Public Worlds events?</th></tr></thead>
                    <tbody><tr><td>Wednesday 22nd June</td><td>17:00 - 22:00</td><td>Festival events</td></tr></tbody>
                  </Table>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>
          </Col>
        </Row>
      </Container>
      <Footer />
    </Container>
  );
}
