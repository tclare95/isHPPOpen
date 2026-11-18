// Homepage presentation of the authoritative HPP status and the latest Colwick level.
//
// Pure and client-safe: no I/O. The open/closed status always comes from
// `/api/hppstatus` (the `openIndicator` record the HPP status service writes,
// #89). The homepage never derives its own status from a level reading; it
// only uses the same rule (`isOpenAtLevel`) to say when the latest reading is
// on the other side of 2.2 m from the recorded status.

import { HPP_RULE_V1, isOpenAtLevel } from "./hppDecision.js";
import { getDisplayedHealthState, OPERATIONAL_STALE_MS } from "../operationalHealth.js";

export const HPP_THRESHOLD_METRES = HPP_RULE_V1.closedAtOrAboveMetres;

const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The newest usable level reading, or null. A missing or non-numeric reading is never 0 m. */
export function getLatestLevelReading(levelData) {
  const entry = Array.isArray(levelData?.level_data) ? levelData.level_data[0] : null;
  const level = entry?.reading_level;
  const observedAt = toDate(entry?.reading_date);
  if (typeof level !== "number" || !Number.isFinite(level) || !observedAt) return null;
  return { level, observedAt };
}

/**
 * "fresh", "stale" or "unavailable" for the latest reading. The route's health
 * is re-checked against the observation time so a cached response cannot keep
 * an old reading looking fresh.
 */
export function getLevelFreshness(levelData, reading, now = new Date()) {
  if (!reading) return "unavailable";
  const healthState = getDisplayedHealthState(levelData?.health ?? null, now.getTime());
  if (healthState === "stale" || healthState === "unavailable") return "stale";
  return now.getTime() - reading.observedAt.getTime() > OPERATIONAL_STALE_MS ? "stale" : "fresh";
}

/** "3 minutes", "1 hour", "5 hours", "2 days": the age of a reading. */
export function formatReadingAge(observedAt, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / 60000));
  const plural = (value, unit) => `${value} ${unit}${value === 1 ? "" : "s"}`;
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, "hour");
  return plural(Math.floor(hours / 24), "day");
}

export const formatLevelMetres = (level) => `${level.toFixed(2)} m`;

/**
 * Whether an event restricts the course today. Events cover whole local days
 * from their start date to their end date inclusive; events with unreadable
 * dates are ignored rather than treated as covering every day.
 */
export function isClosedForEventOn(events, now = new Date()) {
  if (!Array.isArray(events)) return false;
  const today = new Date(now.toDateString()).getTime();
  return events.some((event) => {
    const start = toDate(event?.event_start_date);
    const end = toDate(event?.event_end_date);
    if (!start || !end) return false;
    return new Date(start.toDateString()).getTime() <= today && new Date(end.toDateString()).getTime() >= today;
  });
}

/**
 * The status to show from an `/api/hppstatus` payload:
 * - "open" / "closed": the authoritative recorded status
 * - "unavailable": the status could not be read (route fallback payload)
 * - "unknown": the read succeeded but no valid record exists
 */
export function getRecordedHppStatus(statusData) {
  if (statusData?.health?.state === "unavailable") return "unavailable";
  if (statusData?.isEmpty || typeof statusData?.currentStatus !== "boolean") return "unknown";
  return statusData.currentStatus ? "open" : "closed";
}

/**
 * True when a fresh reading is on the other side of 2.2 m from the recorded
 * status, using the same rule as the HPP service (open strictly below 2.2 m,
 * closed at or above). The recorded status still wins; this only explains it.
 */
export function readingDisagreesWithStatus(recordedStatus, reading, freshness) {
  if (!reading || freshness !== "fresh") return false;
  if (recordedStatus !== "open" && recordedStatus !== "closed") return false;
  return isOpenAtLevel(reading.level) !== (recordedStatus === "open");
}
