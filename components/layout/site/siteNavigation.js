// The site's major public areas, in navigation order. Paths are the existing public URLs; aliases
// (redirecting or closely related routes) mark the same area as current.
export const SITE_AREAS = [
  { key: "home", label: "Home", href: "/" },
  { key: "forecast", label: "Forecast", href: "/forecastinfo", aliases: ["/newforecast"] },
  { key: "history", label: "Level history", href: "/history" },
  { key: "events", label: "High-water events", href: "/history/events" },
  { key: "waterquality", label: "Water quality", href: "/waterquality" },
  { key: "trent", label: "Trent gauges", href: "/trentweirs", aliases: ["/trentcharts", "/trentlock"] },
  { key: "alerts", label: "Alerts", href: "/alerts" },
];

const matches = (pathname, path) => path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);

// The most specific area containing the path, so /history/events/x is "events", not "history".
export function activeAreaKey(pathname) {
  if (typeof pathname !== "string" || !pathname) return null;
  let best = null;
  let bestLength = -1;
  for (const area of SITE_AREAS) {
    for (const path of [area.href, ...(area.aliases ?? [])]) {
      if (matches(pathname, path) && path.length > bestLength) {
        best = area.key;
        bestLength = path.length;
      }
    }
  }
  return best;
}

// Admin pages have their own bar and are not part of the public site chrome.
export const isPublicPath = (pathname) => !(typeof pathname === "string" && (pathname === "/admin" || pathname.startsWith("/admin/")));
