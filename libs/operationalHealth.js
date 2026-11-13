export const OPERATIONAL_STALE_MS = 30 * 60 * 1000;

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function buildOperationalHealth({ source, generatedAt = null, fetchedAt = new Date(), fallback = false, unavailable = false, staleAfterMs = OPERATIONAL_STALE_MS } = {}) {
  const fetchedDate = validDate(fetchedAt) || new Date();
  const generatedDate = validDate(generatedAt);
  const ageSeconds = generatedDate ? Math.max(0, Math.floor((fetchedDate.getTime() - generatedDate.getTime()) / 1000)) : null;
  // Stale outranks fallback so old saved data can never present as acceptable fallback data.
  const state = unavailable ? "unavailable" : !generatedDate || ageSeconds > staleAfterMs / 1000 ? "stale" : fallback ? "fallback" : "fresh";

  return { source, generatedAt: generatedDate?.toISOString() ?? null, fetchedAt: fetchedDate.toISOString(), ageSeconds, state };
}

// A cached response keeps the state computed when it was generated (up to the 900s route cache plus
// stale-while-revalidate). When `generatedAt` is the observed time, re-check it at display time so an
// observation older than the freshness limit is never shown as fresh or acceptable fallback.
export function getDisplayedHealthState(health, now = Date.now(), staleAfterMs = OPERATIONAL_STALE_MS) {
  if (!health) return null;
  if (health.state !== "fresh" && health.state !== "fallback") return health.state;
  const observed = validDate(health.generatedAt);
  return observed && now - observed.getTime() > staleAfterMs ? "stale" : health.state;
}

export function getNewestTimestamp(...values) {
  const dates = values.flat().map(validDate).filter(Boolean);
  return dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString() : null;
}
