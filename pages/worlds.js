import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Header from "../components/layout/frontpage/header";
import Meta from "../components/meta";
import Link from "next/link";
import Accordion from 'react-bootstrap/Accordion';

export default function WorldChamps() {
  return (
    <>
      <Container fluid className="bg-dark">
        <Meta title="Nottingham Worlds 2022 - Is HPP Open" />
        <Header message="This page will have specific information about the Nottingham Worlds 2022 - more info will be added as it is released" />
        <Container className="text-white text-center">
          <Row className="mb-5">
            <Col>
              <h1>Nottingham Worlds 2022</h1>
            </Col>
          </Row>
          <Row>
            <Col>
              <h2>Key Dates</h2>
              <h5>
                <span className="text-bold">Official Training:</span>{" "}
                <span className="font-weight-light font-italic">
                  Wednesday 22nd June - Sunday 26th June 2022
                </span>
              </h5>
              <h5>
                <span className="text-bold">Competition:</span>{" "}
                <span className="font-weight-light font-italic">
                  Wednesday 22nd June - Sunday 26th June 2022
                </span>
              </h5>
              <Link href="#schedule">
                <h6>
                  <a>Click Here for more details on dates</a>
                </h6>
              </Link>
            </Col>
          </Row>
          <Row>
            <Col>
              <h2>Full Schedule Info</h2>
              <Accordion defaultActiveKey="0">
                <Accordion.Item eventKey="0">
                  <Accordion.Header>Competition Dates</Accordion.Header>
                  <Accordion.Body>1234</Accordion.Body>
                </Accordion.Item>
                <Accordion.Item eventKey="1">
                  <Accordion.Header>Competition Dates</Accordion.Header>
                  <Accordion.Body>1234</Accordion.Body>
                </Accordion.Item>
              </Accordion>
              
            </Col>
          </Row>
        </Container>
      </Container>
    </>
  );
}
