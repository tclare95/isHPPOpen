import "server-only";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import { buildOperationalHealth } from "../operationalHealth";
import {
  buildGovernmentForecastHealth,
  COLWICK_LEVEL,
  describeObserved,
  getLegacyLevelsSnapshot,
  normalizeReadingsArray,
  readEaColwickLevels,
  toLevelData,
} from "../services/levelsService";
import { compareTrentSeries } from "./trentParity.js";
import { readRdpSeries } from "./trentSource.js";
import { isSeriesFresh } from "./trentSeries.js";

export { LEVELS_READING_LIMIT } from "../services/levelsService";
const RDP_LEVELS_SOURCE = "river-data-platform-levels";

let lastKnownLevels = null;

function newestTime(candidate) {
  return Date.parse(candidate.readings[0].dateTime);
}

// Whole-series selection: never mixes RDP and EA points. Fresh RDP, else fresh validated direct EA
// (read only when RDP is not fresh), else the newest stale candidate (including last-known), reported stale.
async function resolveLevels(rdp, now) {
  if (rdp.readings && isSeriesFresh(rdp.readings, now)) {
    return { chosen: { origin: "rdp", readings: rdp.readings }, ea: null };
  }

  const ea = await readEaColwickLevels();
  if (ea.readings && isSeriesFresh(ea.readings, now)) {
    return { chosen: { origin: "ea", readings: ea.readings }, ea };
  }

  const candidates = [
    rdp.readings && { origin: "rdp", readings: rdp.readings },
    ea.readings && { origin: "ea", readings: ea.readings },
    lastKnownLevels && { origin: "cache", readings: lastKnownLevels },
  ].filter(Boolean);

  return { chosen: candidates.sort((a, b) => newestTime(b) - newestTime(a))[0] ?? null, ea };
}

export async function getRdpLevelsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/levels");
  const rdp = await readRdpSeries(COLWICK_LEVEL);
  const { chosen, ea } = await resolveLevels(rdp, now);
  if (chosen && chosen.origin !== "cache") lastKnownLevels = chosen.readings;

  const observed = describeObserved(chosen, now);

  if (rdp.error || observed.origin !== "rdp") {
    logger.warn(`RDP levels display degraded ${JSON.stringify({
      rdpError: rdp.error ?? null, eaError: ea?.error ?? null, origin: observed.origin, state: observed.state,
    })}`);
  }

  if (!chosen) {
    throw new HttpError(502, "Failed to fetch levels data");
  }

  // Top-level health describes observed levels only; the retired government forecast is reported beside it.
  return {
    level_data: toLevelData(chosen.readings),
    forecast_data: [],
    health: {
      ...buildOperationalHealth({ source: RDP_LEVELS_SOURCE, generatedAt: observed.observedAt, fetchedAt: now, fallback: chosen.origin !== "rdp" }),
      observed,
      forecast: buildGovernmentForecastHealth(now),
    },
  };
}

function toReadings(levelData) {
  return normalizeReadingsArray(levelData)
    .map((row) => ({ dateTime: row?.reading_date, value: row?.reading_level }))
    .filter((reading) => Number.isFinite(Date.parse(reading.dateTime)) && Number.isFinite(reading.value));
}

// Legacy (direct EA) stays authoritative and the returned object is the legacy result itself. The
// RDP side runs concurrently, cannot reject and only produces a log line; it writes no state.
export async function getShadowLevelsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/levels-shadow");

  const [legacy, rdp] = await Promise.all([
    getLegacyLevelsSnapshot().then((value) => ({ value }), (error) => ({ error })),
    readRdpSeries(COLWICK_LEVEL),
  ]);

  try {
    const report = {
      comparedAt: now.toISOString(),
      legacyState: legacy.value?.health?.state ?? "unavailable",
      series: compareTrentSeries({
        key: COLWICK_LEVEL.key,
        measureType: COLWICK_LEVEL.measureType,
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
