"use client";

import AdminBar from "../../../components/layout/adminpage/adminbar";
import Container from "react-bootstrap/Container";
import AdminBody from "../../../components/layout/adminpage/adminbody";
import EventsTable from "../../../components/functional/eventstable";

export default function AdminEventsPage() {
  return (
    <Container fluid className="bg-dark text-light min-vh-100">
      <AdminBar />
      <AdminBody>
        <div className="mb-4">
          <h1 className="mb-2">Events</h1>
          <p className="text-secondary mb-0">
            Select an existing event to edit it, or start a new one. Deletes require confirmation.
          </p>
        </div>
        <EventsTable />
      </AdminBody>
    </Container>
  );
}
