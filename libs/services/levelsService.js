import "server-only";
import { HttpError } from '../api/http';
import { createRequestLogger } from '../api/logger';
import { buildOperationalHealth } from "../operationalHealth";
import { getRdpMeasurement } from "../rdp/measurements.js";
import { getSeriesAgeSeconds, isSeriesFresh, validateLegacySeries } from "../rdp/trentSeries.js";
import { fetchLegacyMeasureItems } from "./trentWeirsService";

const LEVELS_SOURCE_MODES = ["legacy", "shadow", "rdp"];

// Matches the retired scraper snapshot's READINGS_LIMIT, so every mode serves the same 5-day `level_data` depth.
export const LEVELS_READING_LIMIT = 480;
export const EA_LEVELS_SOURCE = "environment-agency-levels";
export const GOVERNMENT_FORECAST_SOURCE = "government-forecast";
// One bounded direct-EA request. A slow EA response cannot hold /api/levels open beyond this.
export const EA_LEVELS_READ_DEADLINE_MS = 8000;

export const COLWICK_LEVEL = Object.freeze({
  key: "4009-level",
  stationId: 4009,
  measureType: "level",
  measure: getRdpMeasurement("4009-level"),
});

export function normalizeReadingsArray(value) {
  return Array.isArray(value) ? value : [];
}

// The government station-page forecast is retired (#90): `forecast_data` stays in the envelope,
// always empty, and is never filled with the trent-predictor forecast (served by /api/s3forecast).
export function buildGovernmentForecastHealth(now = new Date()) {
  return { ...buildOperationalHealth({ source: GOVERNMENT_FORECAST_SOURCE, fetchedAt: now, unavailable: true }), reason: "retired" };
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("EA_TIMEOUT")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// Never rejects. One request for the exact `4009-level-stage-i-15_min-mASD` measure, sharing the
// Trent dashboard's URL and 900s fetch cache; the whole series is rejected on any invalid row.
export async function readEaColwickLevels() {
  try {
    const items = await withDeadline(
      fetchLegacyMeasureItems(COLWICK_LEVEL.stationId, COLWICK_LEVEL.measureType),
      EA_LEVELS_READ_DEADLINE_MS,
    );
    const readings = validateLegacySeries(items, COLWICK_LEVEL.measure);
    return readings ? { readings } : { error: "EA_INVALID_SERIES" };
  } catch (error) {
    return { error: error?.message === "EA_TIMEOUT" ? "EA_TIMEOUT" : "EA_UNAVAILABLE" };
  }
}

export function toLevelData(readings) {
  return readings
    .slice(0, LEVELS_READING_LIMIT)
    .map((reading) => ({ reading_date: reading.dateTime, reading_level: reading.value }));
}

export function describeObserved(chosen, now = new Date()) {
  if (!chosen) {
    return { origin: null, state: "unavailable", observedAt: null, ageSeconds: null };
  }
  return {
    origin: chosen.origin,
    state: isSeriesFresh(chosen.readings, now) ? "fresh" : "stale",
    observedAt: chosen.readings[0].dateTime,
    ageSeconds: getSeriesAgeSeconds(chosen.readings, now),
  };
}

let lastKnownEaLevels = null;

// Non-RDP observed levels: direct EA, else this instance's last-known EA series (reported stale).
// It no longer reads the scraper's public `levels/latest.json`.
export async function getLegacyLevelsSnapshot() {
  const now = new Date();
  const ea = await readEaColwickLevels();
  if (ea.readings) lastKnownEaLevels = ea.readings;

  const chosen = ea.readings
    ? { origin: "ea", readings: ea.readings }
    : lastKnownEaLevels && { origin: "cache", readings: lastKnownEaLevels };

  if (!chosen) {
    createRequestLogger({ method: "GET" }, "levels").warn(`EA levels unavailable ${JSON.stringify({ eaError: ea.error })}`);
    throw new HttpError(502, 'Failed to fetch levels data');
  }

  const observed = describeObserved(chosen, now);
  return {
    level_data: toLevelData(chosen.readings),
    forecast_data: [],
    health: {
      ...buildOperationalHealth({ source: EA_LEVELS_SOURCE, generatedAt: observed.observedAt, fetchedAt: now, fallback: chosen.origin !== "ea" }),
      observed,
      forecast: buildGovernmentForecastHealth(now),
    },
  };
}

// Read independently of the other RDP consumers; an invalid value keeps observed levels on legacy.
export function getLevelsSourceMode(env = process.env) {
  const mode = env.RDP_LEVELS_SOURCE ?? "legacy";
  return LEVELS_SOURCE_MODES.includes(mode) ? mode : null;
}

export async function getLatestLevelsSnapshot() {
  const mode = getLevelsSourceMode();

  if (mode === null) {
    createRequestLogger({ method: "GET" }, "rdp/levels").error("Invalid RDP_LEVELS_SOURCE; serving legacy");
  }

  if (mode === "shadow" || mode === "rdp") {
    // Loaded only outside legacy so the default path never touches the server-only RDP client.
    const { getRdpLevelsSnapshot, getShadowLevelsSnapshot } = await import("../rdp/levelsSource");
    return mode === "rdp" ? getRdpLevelsSnapshot() : getShadowLevelsSnapshot();
  }

  return getLegacyLevelsSnapshot();
}

export function __resetLegacyLevelsStateForTests() {
  lastKnownEaLevels = null;
}
