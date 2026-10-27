import "server-only";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import { buildOperationalHealth } from "../operationalHealth";
import { fetchLegacyLevelsPayload, getLegacyLevelsSnapshot, normalizeReadingsArray } from "../services/levelsService";
import { getRdpMeasurement } from "./measurements.js";
import { compareTrentSeries } from "./trentParity.js";
import { readRdpSeries } from "./trentSource.js";
import { getSeriesAgeSeconds, isSeriesFresh } from "./trentSeries.js";

// Matches the scraper's default READINGS_LIMIT, so RDP serves the same 5-day `level_data` depth.
export const LEVELS_READING_LIMIT = 480;
const RDP_LEVELS_SOURCE = "river-data-platform-levels";
const FORECAST_SOURCE = "scraper-levels";
const COLWICK = Object.freeze({ key: "4009-level", measureType: "level", measure: getRdpMeasurement("4009-level") });

let lastKnownLevels = null;

// Validates the complete scraper Colwick series for display fallback; null rejects the whole series.
// The snapshot carries no per-row measure, so identity rests on the scraper's fixed 4009 station.
export function validateLegacyLevels(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const readings = [];
  for (const row of rows) {
    const time = Date.parse(row?.reading_date);

    if (typeof row?.reading_date !== "string" || typeof row.reading_level !== "number" ||
        !Number.isFinite(row.reading_level) || !Number.isFinite(time) ||
        (readings.length > 0 && time >= Date.parse(readings.at(-1).dateTime))) {
      return null;
    }

    readings.push({ dateTime: row.reading_date, value: row.reading_level });
  }

  return readings;
}

// Never rejects: a legacy failure only removes forecast data and the fallback candidate.
async function readLegacyPayload() {
  try {
    return { payload: await fetchLegacyLevelsPayload() };
  } catch {
    return { error: "LEGACY_UNAVAILABLE" };
  }
}

function newestTime(candidate) {
  return Date.parse(candidate.readings[0].dateTime);
}

// Whole-series selection: never mixes RDP and scraper points. Fresh RDP, else fresh validated
// legacy, else the newest stale candidate (including last-known), which is reported as stale.
function resolveLevels(rdp, legacy, now) {
  if (rdp.readings && isSeriesFresh(rdp.readings, now)) {
    return { origin: "rdp", readings: rdp.readings };
  }
  if (legacy && isSeriesFresh(legacy, now)) {
    return { origin: "legacy", readings: legacy };
  }

  const candidates = [
    rdp.readings && { origin: "rdp", readings: rdp.readings },
    legacy && { origin: "legacy", readings: legacy },
    lastKnownLevels && { origin: "cache", readings: lastKnownLevels },
  ].filter(Boolean);

  return candidates.sort((a, b) => newestTime(b) - newestTime(a))[0] ?? null;
}

function describeObserved(chosen, now) {
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

// Forecast age is the scraper snapshot's write time, never the (future) forecast dates.
function buildForecastHealth(legacy, forecast_data, now) {
  if (legacy.error || forecast_data.length === 0) {
    return buildOperationalHealth({ source: FORECAST_SOURCE, fetchedAt: now, unavailable: true });
  }
  const payload = legacy.payload;
  return buildOperationalHealth({ source: FORECAST_SOURCE, generatedAt: payload?.model_date ?? payload?.generatedAt ?? payload?.timestamp ?? null, fetchedAt: now });
}

export async function getRdpLevelsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/levels");
  const [rdp, legacy] = await Promise.all([readRdpSeries(COLWICK), readLegacyPayload()]);

  const forecast_data = legacy.payload ? normalizeReadingsArray(legacy.payload.forecast_readings) : [];
  const legacyLevels = legacy.payload ? validateLegacyLevels(legacy.payload.level_readings) : null;
  const chosen = resolveLevels(rdp, legacyLevels, now);
  if (chosen && chosen.origin !== "cache") lastKnownLevels = chosen.readings;

  const observed = describeObserved(chosen, now);
  const forecast = buildForecastHealth(legacy, forecast_data, now);

  if (rdp.error || observed.origin !== "rdp" || forecast.state === "unavailable") {
    logger.warn(`RDP levels display degraded ${JSON.stringify({
      rdpError: rdp.error ?? null, legacyError: legacy.error ?? null,
      legacyLevelsValid: Boolean(legacyLevels), origin: observed.origin, forecastState: forecast.state,
    })}`);
  }

  if (!chosen && forecast.state === "unavailable") {
    throw new HttpError(502, "Failed to fetch levels data");
  }

  const level_data = chosen
    ? chosen.readings.slice(0, LEVELS_READING_LIMIT).map((reading) => ({ reading_date: reading.dateTime, reading_level: reading.value }))
    : [];
  const levelsHealth = chosen
    ? buildOperationalHealth({ source: RDP_LEVELS_SOURCE, generatedAt: observed.observedAt, fetchedAt: now, fallback: chosen.origin !== "rdp" })
    : buildOperationalHealth({ source: RDP_LEVELS_SOURCE, fetchedAt: now, unavailable: true });

  // Top-level health describes observed levels only; forecast freshness is reported beside it.
  return { level_data, forecast_data, health: { ...levelsHealth, observed, forecast } };
}

function toReadings(levelData) {
  return normalizeReadingsArray(levelData)
    .map((row) => ({ dateTime: row?.reading_date, value: row?.reading_level }))
    .filter((reading) => Number.isFinite(Date.parse(reading.dateTime)) && Number.isFinite(reading.value));
}

// Legacy stays authoritative and the returned object is the legacy result itself. The RDP
// side runs concurrently, cannot reject and only produces a log line; it writes no state.
export async function getShadowLevelsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/levels-shadow");

  const [legacy, rdp] = await Promise.all([
    getLegacyLevelsSnapshot().then((value) => ({ value }), (error) => ({ error })),
    readRdpSeries(COLWICK),
  ]);

  try {
    const report = {
      comparedAt: now.toISOString(),
      legacyState: legacy.value?.health?.state ?? "unavailable",
      series: compareTrentSeries({
        key: COLWICK.key,
        measureType: COLWICK.measureType,
        legacyReadings: toReadings(legacy.value?.level_data),
        rdpReadings: rdp.readings,
        rdpError: rdp.error ?? null,
        now,
      }),
    };
    logger.info(`RDP levels shadow comparison ${JSON.stringify(report)}`);
  } catch {
    logger.warn("RDP levels shadow comparison failed");
  }

  if (legacy.error) throw legacy.error;
  return legacy.value;
}

export function __resetRdpLevelsStateForTests() {
  lastKnownLevels = null;
}
