"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Container from "react-bootstrap/Container";
import { SITE_AREAS, isPublicPath } from "./siteNavigation";

export default function SiteFooter() {
  const pathname = usePathname();
  if (!isPublicPath(pathname)) return null;

  return (
    <footer className="site-footer">
      <Container>
        <nav aria-label="Footer">
          <ul className="site-footer__links">
            {SITE_AREAS.map((area) => <li key={area.key}><Link href={area.href}>{area.label}</Link></li>)}
            <li><Link href="/trentlock">Log a Trent Lock session</Link></li>
          </ul>
        </nav>
        <p className="mb-2">
          An independent site, not associated with the National Water Sports Centre (NWSC) Nottingham. Course status is a
          guide from river levels and published events, not a guarantee that HPP is open.
        </p>
        <details>
          <summary>About this site and its data</summary>
          <p className="mt-2 mb-2">
            Water-quality information is a general indication from upstream storm-overflow activity and river conditions.
            It is not a test of the water and cannot tell you whether it is safe; take normal precautions such as washing
            your hands. Source and method details are on the <Link href="/waterquality" className="site-link">water quality</Link> page.
          </p>
          <p className="mb-2">This uses Environment Agency flood and river level data from the real-time data API (Beta).</p>
          <p className="mb-0">Built by <a href="https://tomclare.dev">Tom Clare</a>. Please get in touch about bugs or suggestions.</p>
        </details>
      </Container>
    </footer>
  );
}
