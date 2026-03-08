import { signIn, signOut, useSession } from "next-auth/react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Link from "next/link";
import Button from "react-bootstrap/Button";
import Container from "react-bootstrap/Container";

export default function AdminBar() {
  const { data: session } = useSession();

  if (session) {
    return (
      <Navbar bg="dark" expand="lg" variant="dark" className="border-bottom border-secondary mb-4 py-3">
        <Container fluid="lg">
          <Navbar.Brand as={Link} href="/admin" className="fw-semibold">
            Is HPP Open Admin
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse>
            <Nav className="me-auto gap-lg-2">
              <Nav.Link as={Link} href="/admin">Overview</Nav.Link>
              <Nav.Link as={Link} href="/admin/events">Events</Nav.Link>
              <Nav.Link as={Link} href="/admin/message">Site banner</Nav.Link>
            </Nav>
            <div className="d-flex align-items-center gap-3 mt-3 mt-lg-0">
              <Navbar.Text className="text-secondary">
                Signed in as {session.user?.name || session.user?.email}
              </Navbar.Text>
              <Button variant="outline-light" onClick={signOut}>Sign out</Button>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    );
  }

  return (
    <Navbar bg="dark" expand="lg" variant="dark" className="border-bottom border-secondary mb-4 py-3">
      <Container fluid="lg">
        <Navbar.Brand as={Link} href="/admin" className="fw-semibold">
          Is HPP Open Admin
        </Navbar.Brand>
        <Navbar.Toggle />
        <Navbar.Collapse className="justify-content-end">
          <div className="d-flex align-items-center gap-3 mt-3 mt-lg-0">
            <Navbar.Text className="text-secondary">Sign in to edit events and site messaging.</Navbar.Text>
            <Button onClick={signIn}>Sign in</Button>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
