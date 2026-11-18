"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_AREAS, activeAreaKey, isPublicPath } from "./siteNavigation";

// A quiet, collapsed "Menu" disclosure rather than a header bar. Not sticky, so it never covers maps or charts.
export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  if (!isPublicPath(pathname)) return null;
  const active = activeAreaKey(pathname);

  const close = () => setOpen(false);
  const onKeyDown = (event) => {
    if (event.key === "Escape" && open) {
      close();
      toggleRef.current?.focus();
    }
  };

  return (
    <div className="site-menu">
      <a href="#content" className="visually-hidden-focusable">Skip to content</a>
      <nav aria-label="Main" className="container" onKeyDown={onKeyDown}>
        <button ref={toggleRef} type="button" className="site-menu__toggle" aria-expanded={open} aria-controls="site-menu-list"
          onClick={() => setOpen((value) => !value)}>
          Menu <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
        <ul id="site-menu-list" className="site-menu__list" hidden={!open}>
          {SITE_AREAS.map((area) => (
            <li key={area.key}>
              <Link href={area.href} onClick={close} aria-current={active === area.key ? "page" : undefined}>{area.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
