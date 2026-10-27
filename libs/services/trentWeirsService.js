import { HttpError } from "../api/http";
import { fetchWithOperationalRevalidate } from "../api/fetchWithRevalidate";
import { createRequestLogger } from "../api/logger";
import {
  getTrentStationDefinitions,
  TRENT_DASHBOARD_READING_LIMIT,
  TRENT_READINGS_PER_DAY,
  TRENT_READINGS_PER_HOUR,
} from "../trentWeirsConfig";
import { buildOperationalHealth, getNewestTimestamp } from "../operationalHealth";

const EA_BASE_URL = "https://environment.data.gov.uk/flood-monitoring/id/stations";
const TRENT_SOURCE_MODES = ["legacy", "shadow", "rdp"];
let lastSuccessfulSnapshot = null;

function buildStationReadingsUrl(stationId, measureType) {
  return `${EA_BASE_URL}/${stationId}/readings?_sorted&_limit=${TRENT_DASHBOARD_READING_LIMIT}&parameter=${measureType}`;
}

function roundToSingleDecimal(value) {
  return Number(value.toFixed(1));
}

export function buildMeasureSnapshot(items, measureType) {
  const readings = items
    .map((item) => ({
      dateTime: item.dateTime,
      value: typeof item.value === "number" ? item.value : Number(item.value),
    }))
    .filter((item) => item.dateTime && Number.isFinite(item.value));

  if (readings.length === 0) {
    return null;
  }

  const latestValue = readings[0]?.value ?? 0;
  const readingOneHourAgo = readings[TRENT_READINGS_PER_HOUR]?.value ?? latestValue;
  const readingOneDayAgo = readings[TRENT_READINGS_PER_DAY]?.value ?? latestValue;
  const changeMultiplier = measureType === "level" ? 100 : 1;

  return {
    measureType,
    latestValue,
    rateOfChangeHour: roundToSingleDecimal((latestValue - readingOneHourAgo) * changeMultiplier),
    rateOfChangeDay: roundToSingleDecimal((latestValue - readingOneDayAgo) * changeMultiplier),
    readings,
  };
}

function buildStationSnapshot(stationDefinition, readingsByMeasureType) {
  const measures = stationDefinition.measureTypes.reduce((accumulator, measureType) => {
    const measureSnapshot = buildMeasureSnapshot(readingsByMeasureType[measureType] ?? [], measureType);

    if (measureSnapshot) {
      accumulator[measureType] = measureSnapshot;
    }

    return accumulator;
  }, {});

  return {
    stationId: stationDefinition.stationId,
    name: stationDefinition.name,
    measures,
  };
}

function buildLegacyHealth(stations, fallback) {
  return buildOperationalHealth({ source: "environment-agency-trent", generatedAt: getNewestTimestamp(stations.map((station) => Object.values(station.measures).flatMap((measure) => measure.readings?.[0]?.dateTime))), fallback });
}

function buildSnapshot(stations, fallback = false, partial = false) {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    fallback,
    partial,
    stations,
    health: buildLegacyHealth(stations, fallback || partial),
  };
}

// Raw Environment Agency items for one complete measurement series, newest first.
export async function fetchLegacyMeasureItems(stationId, measureType) {
  const response = await fetchWithOperationalRevalidate(buildStationReadingsUrl(stationId, measureType));

  if (!response.ok) {
    throw new HttpError(502, `Failed to fetch Trent data for station ${stationId}`);
  }

  const payload = await response.json();
  return payload?.items ?? [];
}

async function fetchStationSnapshot(stationDefinition) {
  const measureEntries = await Promise.all(
    stationDefinition.measureTypes.map(async (measureType) => [
      measureType,
      await fetchLegacyMeasureItems(stationDefinition.stationId, measureType),
    ])
  );

  return buildStationSnapshot(stationDefinition, Object.fromEntries(measureEntries));
}

// Legacy Environment Agency snapshot. Gauge alerts read this directly so a Trent
// display source change never alters alert inputs (RDP_GAUGE_ALERTS_SOURCE is separate).
export async function getLegacyTrentWeirsSnapshot() {
  const stationDefinitions = getTrentStationDefinitions();
  const results = await Promise.allSettled(
    stationDefinitions.map((stationDefinition) => fetchStationSnapshot(stationDefinition))
  );

  const fulfilledStations = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (fulfilledStations.length === stationDefinitions.length) {
    const snapshot = buildSnapshot(fulfilledStations);
    lastSuccessfulSnapshot = snapshot;
    return snapshot;
  }

  if (lastSuccessfulSnapshot) {
    return {
      ...lastSuccessfulSnapshot,
      fallback: true,
      partial: false,
      generatedAt: lastSuccessfulSnapshot.generatedAt,
      // Re-evaluate at the current time: saved data must age into stale, not keep its original fresh state.
      health: buildLegacyHealth(lastSuccessfulSnapshot.stations, true),
    };
  }

  if (fulfilledStations.length > 0) {
    return buildSnapshot(fulfilledStations, true, true);
  }

  const firstRejection = results.find((result) => result.status === "rejected");
  throw firstRejection?.reason ?? new HttpError(502, "Failed to fetch Trent weir data");
}

// Read independently of the other RDP consumers; an invalid value keeps the display on legacy.
export function getTrentSourceMode(env = process.env) {
  const mode = env.RDP_TRENT_SOURCE ?? "legacy";
  return TRENT_SOURCE_MODES.includes(mode) ? mode : null;
}

export async function getTrentWeirsSnapshot() {
  const mode = getTrentSourceMode();

  if (mode === null) {
    createRequestLogger({ method: "GET" }, "rdp/trent").error("Invalid RDP_TRENT_SOURCE; serving legacy");
  }

  if (mode === "shadow" || mode === "rdp") {
    // Loaded only outside legacy so the default path never touches the server-only RDP client.
    const { getRdpTrentWeirsSnapshot, getShadowTrentWeirsSnapshot } = await import("../rdp/trentSource");
    return mode === "rdp" ? getRdpTrentWeirsSnapshot() : getShadowTrentWeirsSnapshot();
  }

  return getLegacyTrentWeirsSnapshot();
}

export function buildEmptyTrentWeirsPayload() {
  return {
    generatedAt: null,
    fallback: true,
    partial: false,
    stations: [],
    health: buildOperationalHealth({ source: "environment-agency-trent", unavailable: true }),
  };
}

export function __resetTrentWeirsSnapshotCacheForTests() {
  lastSuccessfulSnapshot = null;
}
