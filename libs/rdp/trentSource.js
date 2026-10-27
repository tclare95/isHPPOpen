import "server-only";
import { unstable_cache } from "next/cache";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import { API_OPERATIONAL_REVALIDATE_SECONDS } from "../dataFreshness";
import { buildOperationalHealth } from "../operationalHealth";
import { getTrentStationDefinitions, getTrentStationKey } from "../trentWeirsConfig";
import {
  buildMeasureSnapshot,
  fetchLegacyMeasureItems,
  getLegacyTrentWeirsSnapshot,
} from "../services/trentWeirsService";
import { createRdpClient } from "./client.js";
import { RdpError } from "./errors.js";
import { getRdpMeasurement } from "./measurements.js";
import { compareTrentSeries } from "./trentParity.js";
import { getSeriesAgeSeconds, isSeriesFresh, readTrentHistory, validateLegacySeries } from "./trentSeries.js";

// Per-series budget so one slow measurement cannot hold the dashboard to the client's 30s limit.
export const RDP_TRENT_READ_DEADLINE_MS = 10000;
const RDP_TRENT_SOURCE = "river-data-platform-trent";

let client = null;
const lastKnownSeries = new Map();

function getClient() {
  client ??= createRdpClient();
  return client;
}

// The client fetches with `no-store`; inside an unstable_cache scope that does not make the
// 900s /api/trentweirs route dynamic, and the read keeps the legacy EA fetch's 900s data cache.
// Failed reads are not cached. Values are public observations only, never credentials.
const readCachedHistory = unstable_cache(
  (measurementId) => readTrentHistory(getClient(), measurementId),
  ["rdp-trent-history-v1"],
  { revalidate: API_OPERATIONAL_REVALIDATE_SECONDS, tags: ["rdp-trent-history"] }
);

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RdpError("TIMEOUT")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function getTrentSeries() {
  return getTrentStationDefinitions().flatMap((station) => station.measureTypes.map((measureType) => {
    const key = getTrentStationKey({ stationId: station.stationId, measureType });
    return { key, station, measureType, measure: getRdpMeasurement(key) };
  }));
}

// Never rejects: only a fixed error code leaves this boundary.
async function readRdpSeries(series) {
  try {
    const readings = await withDeadline(readCachedHistory(series.measure.measurementId), RDP_TRENT_READ_DEADLINE_MS);
    return readings.length ? { readings } : { error: "NO_OBSERVATIONS" };
  } catch (error) {
    return { error: error instanceof RdpError ? error.code : "UNEXPECTED_ERROR" };
  }
}

async function readLegacySeries(series) {
  try {
    return validateLegacySeries(await fetchLegacyMeasureItems(series.station.stationId, series.measureType), series.measure);
  } catch {
    return null;
  }
}

function newestFirstTime(candidate) {
  return Date.parse(candidate.readings[0].dateTime);
}

// Whole-series selection: never mixes RDP and EA points. Fresh RDP, else fresh validated legacy,
// else the newest stale candidate (including last-known), which is reported as stale.
async function resolveDisplaySeries(series, rdp, now) {
  if (rdp.readings && isSeriesFresh(rdp.readings, now)) {
    return { origin: "rdp", readings: rdp.readings };
  }

  const legacy = await readLegacySeries(series);
  if (legacy && isSeriesFresh(legacy, now)) {
    return { origin: "legacy", readings: legacy };
  }

  const lastKnown = lastKnownSeries.get(series.key);
  const candidates = [
    rdp.readings && { origin: "rdp", readings: rdp.readings },
    legacy && { origin: "legacy", readings: legacy },
    lastKnown && { origin: "cache", readings: lastKnown },
  ].filter(Boolean);

  return candidates.sort((a, b) => newestFirstTime(b) - newestFirstTime(a))[0] ?? null;
}

function describeSeries({ series, chosen }, now) {
  if (!chosen) {
    return { key: series.key, origin: null, state: "unavailable", observedAt: null, ageSeconds: null };
  }

  return {
    key: series.key,
    origin: chosen.origin,
    state: isSeriesFresh(chosen.readings, now) ? "fresh" : "stale",
    observedAt: chosen.readings[0].dateTime,
    ageSeconds: getSeriesAgeSeconds(chosen.readings, now),
  };
}

export async function getRdpTrentWeirsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/trent");
  const resolved = await Promise.all(getTrentSeries().map(async (series) => {
    const rdp = await readRdpSeries(series);
    const chosen = await resolveDisplaySeries(series, rdp, now);
    if (chosen && chosen.origin !== "cache") lastKnownSeries.set(series.key, chosen.readings);
    return { series, rdp, chosen };
  }));
  const byKey = new Map(resolved.map((entry) => [entry.series.key, entry]));

  const stations = getTrentStationDefinitions()
    .map((station) => ({
      stationId: station.stationId,
      name: station.name,
      measures: Object.fromEntries(station.measureTypes.flatMap((measureType) => {
        const chosen = byKey.get(getTrentStationKey({ stationId: station.stationId, measureType })).chosen;
        const snapshot = chosen && buildMeasureSnapshot(chosen.readings, measureType);
        return snapshot ? [[measureType, snapshot]] : [];
      })),
    }))
    .filter((station) => Object.keys(station.measures).length > 0);

  const degraded = resolved.filter(({ rdp, chosen }) => rdp.error || chosen?.origin !== "rdp");
  if (degraded.length) {
    logger.warn(`RDP Trent display degraded ${JSON.stringify(degraded.map(({ series, rdp, chosen }) => ({
      key: series.key, rdpError: rdp.error ?? null, origin: chosen?.origin ?? null,
    })))}`);
  }

  if (stations.length === 0) {
    throw new HttpError(502, "Failed to fetch Trent weir data");
  }

  const served = resolved.filter(({ chosen }) => chosen);
  const fallback = served.some(({ chosen }) => chosen.origin !== "rdp");
  const partial = served.length < resolved.length;
  // The oldest series sets the age, so any single stale series makes the snapshot stale.
  const oldestNewest = new Date(Math.min(...served.map(({ chosen }) => newestFirstTime(chosen)))).toISOString();

  return {
    generatedAt: now.toISOString(),
    fallback: fallback || partial,
    partial,
    stations,
    health: {
      ...buildOperationalHealth({ source: RDP_TRENT_SOURCE, generatedAt: oldestNewest, fetchedAt: now, fallback: fallback || partial }),
      series: resolved.map((entry) => describeSeries(entry, now)),
    },
  };
}

function findLegacyReadings(snapshot, series) {
  const station = snapshot?.stations?.find((item) => item.stationId === series.station.stationId);
  return station?.measures?.[series.measureType]?.readings ?? [];
}

// Legacy stays authoritative and the returned object is the legacy result itself. The RDP
// side runs concurrently, cannot reject and only produces a log line; it writes no state.
export async function getShadowTrentWeirsSnapshot() {
  const now = new Date();
  const logger = createRequestLogger({ method: "GET" }, "rdp/trent-shadow");
  const shadowRead = (async () => {
    const seriesList = getTrentSeries();
    return { seriesList, results: await Promise.all(seriesList.map(readRdpSeries)) };
  })().catch(() => null);

  const [legacy, shadow] = await Promise.all([
    getLegacyTrentWeirsSnapshot().then((value) => ({ value }), (error) => ({ error })),
    shadowRead,
  ]);

  try {
    const report = {
      comparedAt: now.toISOString(),
      legacyState: legacy.value?.health?.state ?? "unavailable",
      series: shadow ? shadow.seriesList.map((series, index) => compareTrentSeries({
        key: series.key,
        measureType: series.measureType,
        legacyReadings: findLegacyReadings(legacy.value, series),
        rdpReadings: shadow.results[index].readings,
        rdpError: shadow.results[index].error ?? null,
        now,
      })) : null,
    };
    logger.info(`RDP Trent shadow comparison ${JSON.stringify(report)}`);
  } catch {
    logger.warn("RDP Trent shadow comparison failed");
  }

  if (legacy.error) throw legacy.error;
  return legacy.value;
}

export function __resetRdpTrentStateForTests() {
  client = null;
  lastKnownSeries.clear();
}
