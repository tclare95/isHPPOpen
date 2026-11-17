"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import { SITE_AREAS, activeAreaKey, isPublicPath } from "./siteNavigation";

export default function SiteNav() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  if (!isPublicPath(pathname)) return null;
  const active = activeAreaKey(pathname);

  return (
    <>
      <a href="#content" className="skip-link">Skip to content</a>
      <Navbar as="nav" expand="lg" variant="dark" collapseOnSelect expanded={expanded} onToggle={setExpanded}
        className="site-nav" aria-label="Main">
        <Container>
          <Navbar.Brand as={Link} href="/">Is HPP Open?</Navbar.Brand>
          <Navbar.Toggle aria-controls="site-nav-menu" label="Menu" aria-expanded={expanded} />
          <Navbar.Collapse id="site-nav-menu">
            <Nav className="ms-auto">
              {SITE_AREAS.map((area) => (
                <Nav.Link key={area.key} as={Link} href={area.href} eventKey={area.key}
                  active={active === area.key} aria-current={active === area.key ? "page" : undefined}>
                  {area.label}
                </Nav.Link>
              ))}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </>
  );
}
