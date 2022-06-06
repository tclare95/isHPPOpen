import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Header from "../components/layout/frontpage/header";
import Meta from "../components/meta";
import Link from "next/link";
import Table from "react-bootstrap/Table"
import Accordion from 'react-bootstrap/Accordion';
import Footer from "../components/layout/frontpage/footer";


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
              <Link href="/"><h2 className="navHeader">← Back to Main Page</h2></Link>
            </Col>
          </Row>
          <Row>
            <Col>
              <h2>Key Dates</h2>
              <h5>
                <span >Official Training Week:</span>{"   "}
                <span className="fw-light fst-italic">
                  Wednesday <span className="fw-bold">22nd</span> June - Sunday <span className="fw-bold">26th</span> June 2022
                </span>
              </h5>
              <h5>
                <span className="text-bold">Competition Week:</span>{"   "}
                <span className="fw-light fst-italic">
                  Monday <span className="fw-bold">27nd</span> June - Saturday <span className="fw-bold">2nd</span> July 2022
                </span>
              </h5>
              <p>
                The course is closed to the public during the competition week, and will have disruption during the training week. The event will be using the course for official team training during much of the day, with the course open to the public during the evening. Times when it will be open are below.
              </p>
              
                <h6>
                  <a>There are competitions as part of the festival of paddling that are open to be public - <Link href="https://britishcanoeingevents.org.uk/freestyle2022/festival-of-paddling/">Click Here</Link> for more information.</a>
                </h6>
            </Col>
          </Row>

          <Row className="mt-5">
            <Col>
              <h2>HPP Bookings</h2>
              <h5>HPP is using different bookings from the 18th of June!!!</h5>
              <h5>
                
                <span className="fw-light fst-italic">
                 1 Hr Slots - £7 - Different slots for competitors and non competitors
                </span>
              </h5>
              <p>
Booking for these slots is <span className="fw-bold"><Link href="https://www.nwscnotts.com/nwsc/bookingscentre/index">open now</Link></span>. Expect them to get booked up quickly, even with extended opening hours into the evenings.              </p>
              
            </Col>
          </Row>
          <Row id ="schedule"className="mt-5">
            <Col>
              <h2>Full Schedule Info</h2>
              <Accordion defaultActiveKey="0">
                <Accordion.Item eventKey="0">
                  <Accordion.Header>Training Dates</Accordion.Header>
                  <Accordion.Body>
                  <Table striped bordered hover size="sm" variant="dark">
  <thead>
    <tr>
      <th>Date</th>
      <th>Times course open for public paddling</th>
      <th>Public Worlds events?</th>
      
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Wednesday 22nd June</td>
      <td>17:00 - 22:00</td>
      <td><Link href="https://britishcanoeingevents.org.uk/freestyle2022/festival-of-paddling/">World Freestyle League</Link></td>
    </tr>
    <tr>
      <td>Thursday 23rd June</td>
      <td>17:00 - 22:00</td>
      <td>-</td>
    </tr>
    <tr>
      <td>Friday 24th June</td>
      <td>17:00 - 22:00</td>
      <td><Link href="https://britishcanoeingevents.org.uk/freestyle2022/festival-of-paddling/">World Freestyle League</Link></td>
    </tr>
    <tr>
      <td>Saturday 25th June</td>
      <td>17:00 - 22:00</td>
      <td><Link href="https://britishcanoeingevents.org.uk/freestyle2022/festival-of-paddling/">Young Guns World Series</Link></td>
    </tr>
    <tr>
      <td>Sunday 26th June</td>
      <td>17:00 - ??:??</td>
      <td><Link href="https://britishcanoeingevents.org.uk/freestyle2022/festival-of-paddling/">Young Guns World Series, Opening Ceremony</Link></td>
    </tr>
  </tbody>
</Table>

                  </Accordion.Body>
                </Accordion.Item>
                <Accordion.Item eventKey="1">
                  <Accordion.Header>Competition Dates</Accordion.Header>
                  <Accordion.Body><Link href="https://britishcanoeingevents.org.uk/freestyle2022/schedule/">
                  Please click here for the official competition schedule
                  </Link></Accordion.Body>
                </Accordion.Item>
              </Accordion>
              
            </Col>
          </Row>
        </Container>
        <Footer />
      </Container>
    </>
  );
}
