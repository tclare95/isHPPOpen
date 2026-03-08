"use client";

import AdminBar from "../../components/layout/adminpage/adminbar";
import Container from "react-bootstrap/Container";
import AdminBody from "../../components/layout/adminpage/adminbody";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Button from "react-bootstrap/Button";
import Link from "next/link";

export default function AdminPage() {
  return (
    <Container fluid className="bg-dark min-vh-100">
      <AdminBar />
      <AdminBody>
        <div className="text-light mb-4">
          <h1 className="mb-2">Admin overview</h1>
          <p className="text-secondary mb-0">
            Manage the two highest-traffic editorial workflows from one place: events and the homepage banner.
          </p>
        </div>

        <Row className="g-4">
          <Col md={6}>
            <Card bg="dark" text="light" border="secondary" className="h-100 shadow-sm">
              <Card.Body>
                <Card.Title>Events</Card.Title>
                <Card.Text className="text-secondary">
                  Create, edit, and delete events with clearer feedback and a focused editor flow.
                </Card.Text>
                <Button as={Link} href="/admin/events">Manage events</Button>
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card bg="dark" text="light" border="secondary" className="h-100 shadow-sm">
              <Card.Body>
                <Card.Title>Site banner</Card.Title>
                <Card.Text className="text-secondary">
                  Update the homepage banner title, message, schedule, and visibility without losing draft content.
                </Card.Text>
                <Button as={Link} href="/admin/message">Manage site banner</Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </AdminBody>
    </Container>
  );
}
