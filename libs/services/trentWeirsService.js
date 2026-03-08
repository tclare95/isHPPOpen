import { HttpError } from "../api/http";
import { fetchWithOperationalRevalidate } from "../api/fetchWithRevalidate";
import {
  getTrentStationDefinitions,
  TRENT_DASHBOARD_READING_LIMIT,
  TRENT_READINGS_PER_DAY,
  TRENT_READINGS_PER_HOUR,
} from "../trentWeirsConfig";

const EA_BASE_URL = "https://environment.data.gov.uk/flood-monitoring/id/stations";
let lastSuccessfulSnapshot = null;

function buildStationReadingsUrl(stationId, measureType) {
  return `${EA_BASE_URL}/${stationId}/readings?_sorted&_limit=${TRENT_DASHBOARD_READING_LIMIT}&parameter=${measureType}`;
}

function roundToSingleDecimal(value) {
  return Number(value.toFixed(1));
}

function buildMeasureSnapshot(items, measureType) {
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

function buildSnapshot(stations, fallback = false, partial = false) {
  return {
    generatedAt: new Date().toISOString(),
    fallback,
    partial,
    stations,
  };
}

async function fetchStationSnapshot(stationDefinition) {
  const measureEntries = await Promise.all(
    stationDefinition.measureTypes.map(async (measureType) => {
      const response = await fetchWithOperationalRevalidate(
        buildStationReadingsUrl(stationDefinition.stationId, measureType)
      );

      if (!response.ok) {
        throw new HttpError(502, `Failed to fetch Trent data for station ${stationDefinition.stationId}`);
      }

      const payload = await response.json();
      return [measureType, payload?.items ?? []];
    })
  );

  return buildStationSnapshot(stationDefinition, Object.fromEntries(measureEntries));
}

export async function getTrentWeirsSnapshot() {
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
    };
  }

  if (fulfilledStations.length > 0) {
    return buildSnapshot(fulfilledStations, true, true);
  }

  const firstRejection = results.find((result) => result.status === "rejected");
  throw firstRejection?.reason ?? new HttpError(502, "Failed to fetch Trent weir data");
}

export function buildEmptyTrentWeirsPayload() {
  return {
    generatedAt: null,
    fallback: true,
    partial: false,
    stations: [],
  };
}

export function __resetTrentWeirsSnapshotCacheForTests() {
  lastSuccessfulSnapshot = null;
}
