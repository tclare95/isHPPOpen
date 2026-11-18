"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_AREAS, activeAreaKey, isPublicPath } from "./siteNavigation";

const ICON_PROPS = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true, focusable: "false" };
const MenuIcon = () => <svg {...ICON_PROPS}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
const CloseIcon = () => <svg {...ICON_PROPS}><path d="M6 6l12 12M18 6L6 18" /></svg>;

// A transparent top row over the page: "← Home" on subsidiary pages and a menu icon that opens a plain list.
// It has no background of its own and is not sticky, so it never covers maps or charts.
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
    <div className="site-topbar">
      <a href="#content" className="visually-hidden-focusable">Skip to content</a>
      <nav aria-label="Main" className="container site-topbar__row" onKeyDown={onKeyDown}>
        {active === "home" ? <span /> : <Link href="/" className="site-topbar__home">← Home</Link>}
        <button ref={toggleRef} type="button" className="site-topbar__toggle" aria-label="Menu" aria-expanded={open}
          aria-controls="site-menu-list" onClick={() => setOpen((value) => !value)}>
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
        <ul id="site-menu-list" className="site-topbar__list" hidden={!open}>
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
