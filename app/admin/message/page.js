"use client";

import AdminBar from "../../../components/layout/adminpage/adminbar";
import Container from "react-bootstrap/Container";
import AdminBody from "../../../components/layout/adminpage/adminbody";
import MessageEditor from "../../../components/functional/messageeditor";

export default function AdminMessagePage() {
  return (
    <Container fluid className="bg-dark min-vh-100">
      <AdminBar />
      <AdminBody>
        <div className="text-light mb-4">
          <h1 className="mb-2">Site banner</h1>
          <p className="text-secondary mb-0">
            Manage the homepage message, title, schedule, and visibility with consistent save feedback.
          </p>
        </div>
        <MessageEditor />
      </AdminBody>
    </Container>
  );
}
