// Strict, bounded validation of public history period queries (#104).
import { COLWICK_HISTORY } from "./config.js";
import { currentLondonMonth } from "./ukCalendar.js";

const INTEGER = /^\d{1,4}$/;

export function parseHistoryPeriod(searchParams, { requireMonth = false, now = Date.now() } = {}) {
  const current = currentLondonMonth(now);
  const yearText = searchParams.get("year");
  const monthText = searchParams.get("month");
  if (!INTEGER.test(yearText ?? "") || (requireMonth && !INTEGER.test(monthText ?? ""))) {
    return { error: "year (and month where required) must be whole numbers" };
  }
  const year = Number(yearText);
  if (year < COLWICK_HISTORY.firstYear || year > current.year) {
    return { error: `year must be between ${COLWICK_HISTORY.firstYear} and ${current.year}` };
  }
  if (!requireMonth) return { year };
  const month = Number(monthText);
  if (month < 1 || month > 12) return { error: "month must be between 1 and 12" };
  if (year === current.year && month > current.month) return { error: "month must not be in the future" };
  return { year, month };
}

// Completed periods are cached at the CDN for longer than in-progress ones.
export function historyCacheHeaders(inProgress, partial = false) {
  const maxAge = partial ? 60 : inProgress ? 900 : 3600;
  return { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400` };
}
