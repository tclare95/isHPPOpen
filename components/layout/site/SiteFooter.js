"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Container from "react-bootstrap/Container";
import { isPublicPath } from "./siteNavigation";

export default function SiteFooter() {
  const pathname = usePathname();
  if (!isPublicPath(pathname)) return null;

  return (
    <footer className="site-footer border-top border-secondary text-light small py-4">
      <Container>
        <p className="history-muted mb-2">
          An independent site, not associated with the National Water Sports Centre (NWSC) Nottingham. Course status is a
          guide from river levels and published events, not a guarantee that HPP is open.
        </p>
        <details className="history-table mt-0">
          <summary>About this site and its data</summary>
          <p className="history-muted mb-2">
            Water-quality information is a general indication from upstream storm-overflow activity and river conditions.
            It is not a test of the water and cannot tell you whether it is safe; take normal precautions such as washing
            your hands. Source and method details are on the <Link href="/waterquality" className="text-info">water quality</Link> page.
          </p>
          <p className="history-muted mb-2">This uses Environment Agency flood and river level data from the real-time data API (Beta).</p>
          <p className="history-muted mb-0">
            Built by <a href="https://tomclare.dev" className="text-info">Tom Clare</a>. Please get in touch about bugs or
            suggestions. <Link href="/trentlock" className="text-info">Log a Trent Lock session</Link>.
          </p>
        </details>
      </Container>
    </footer>
  );
}
