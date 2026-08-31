import { connectToDatabase } from '../database';
import { HttpError } from '../api/http';
import { buildOperationalHealth } from '../operationalHealth';

const HOURS_TO_MS = 60 * 60 * 1000;
const MINUTES_TO_MS = 60 * 1000;
const STATUS_FRESHNESS_MINUTES = 30;
const STATUS_QUERY_WINDOW_MINUTES = 60;
const RECENT_EVENT_HOURS = 48;

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim()))];
}

function isFresh(value, now, minutes = STATUS_FRESHNESS_MINUTES) {
  const date = validDate(value);
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= -5 * MINUTES_TO_MS && age <= minutes * MINUTES_TO_MS;
}

function eventDurationMinutes(startValue, endValue, fallbackEnd) {
  const start = validDate(startValue);
  const end = validDate(endValue) || fallbackEnd;
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / MINUTES_TO_MS);
}

function mapCsoRecord(doc) {
  const attributes = doc?.attributes || {};
  const geometry = doc?.geometry;
  const x = Number(geometry?.x ?? attributes.Longitude);
  const y = Number(geometry?.y ?? attributes.Latitude);
  return {
    Id: attributes.Id,
    Status: attributes.Status,
    StatusStart: attributes.StatusStart ?? null,
    LatestEventStart: attributes.LatestEventStart ?? null,
    LatestEventEnd: attributes.LatestEventEnd ?? null,
    LastUpdated: attributes.LastUpdated ?? null,
    ReceivingWaterCourse: attributes.ReceivingWaterCourse ?? null,
    DateScraped: doc?.DateScraped ?? null,
    Coordinates: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined,
  };
}

async function getLatestCsoRecords(csoDataCollection, ids, { since } = {}) {
  const normalizedIds = uniqueIds(ids);
  if (!normalizedIds.length) return new Map();
  const match = { 'attributes.Id': { $in: normalizedIds } };
  if (since) match.DateScraped = { $gte: since };
  const rows = await csoDataCollection.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$attributes.Id',
        doc: { $top: { sortBy: { DateScraped: -1 }, output: '$$ROOT' } },
      },
    },
  ]).toArray();
  return new Map(rows.map((row) => [row._id, mapCsoRecord(row.doc)]));
}

function classifyLocation(id, record, { now, summaryFresh, recentCutoff }) {
  const recordFresh = isFresh(record?.DateScraped, now);
  const status = Number(record?.Status);
  const eventEnd = validDate(record?.LatestEventEnd);
  let classification = 'unknown';
  if (summaryFresh && recordFresh && status === 1) classification = 'active';
  else if (recordFresh && status === 0 && eventEnd && eventEnd >= recentCutoff) classification = 'recent';
  else if (recordFresh && status === -1) classification = 'offline';
  const durationEnd = classification === 'active' ? now : eventEnd;
  return {
    id,
    status: classification,
    coordinates: record?.Coordinates ?? null,
    receivingWaterCourse: record?.ReceivingWaterCourse ?? null,
    latestEventStart: record?.LatestEventStart ?? null,
    latestEventEnd: record?.LatestEventEnd ?? null,
    eventDurationMinutes: eventDurationMinutes(record?.LatestEventStart, durationEnd, now),
    observedAt: record?.DateScraped ?? null,
    sourceUpdatedAt: record?.LastUpdated ?? null,
  };
}

function activeHoursWithinWindow(locations, now, cutoff) {
  const milliseconds = locations.reduce((total, location) => {
    if (location.status !== 'active') return total;
    const start = validDate(location.latestEventStart);
    if (!start) return total;
    return total + Math.max(0, now.getTime() - Math.max(start.getTime(), cutoff.getTime()));
  }, 0);
  return Number((milliseconds / HOURS_TO_MS).toFixed(3));
}

export async function getLatestWaterQualitySnapshot(now = new Date()) {
  const { db } = await connectToDatabase();
  const waterQualityCollection = db.collection('waterQuality');
  const csoDataCollection = db.collection('csoData');
  const latest = await waterQualityCollection.find().sort({ scrape_timestamp: -1 }).limit(1).next();
  if (!latest) return null;
  const waterQuality = latest.water_quality || {};
  const csoIds = uniqueIds(waterQuality.CSO_IDs);
  const summaryFresh = isFresh(latest.scrape_timestamp, now);
  const querySince = new Date(now.getTime() - STATUS_QUERY_WINDOW_MINUTES * MINUTES_TO_MS);
  const recentCutoff = new Date(now.getTime() - RECENT_EVENT_HOURS * HOURS_TO_MS);
  const records = await getLatestCsoRecords(csoDataCollection, csoIds, { since: querySince });
  const locations = csoIds.map((id) => classifyLocation(id, records.get(id), { now, summaryFresh, recentCutoff }));
  const count = (status) => locations.filter((location) => location.status === status).length;
  const activeLocations = locations.filter((location) => location.status === 'active');
  return {
    Id: latest.id ?? null,
    ScrapeTimestamp: latest.scrape_timestamp ?? null,
    WaterQuality: {
      NumberUpstreamCSOs: Number(waterQuality.number_upstream_CSOs) || 0,
      NumberCSOsPerKm2: Number(waterQuality.number_CSOs_per_km2) || 0,
      CSOIds: csoIds,
      CSOActiveTime: activeHoursWithinWindow(activeLocations, now, recentCutoff),
    },
    ActiveCSOCount: activeLocations.length,
    ActiveCSOIds: activeLocations.map((location) => location.id),
    statusSummary: {
      currentlySpilling: count('active'),
      recentlyStopped48h: count('recent'),
      offline: count('offline'),
      unknown: count('unknown'),
    },
    locations,
    health: buildOperationalHealth({ source: 'mongodb-water-quality', generatedAt: latest.scrape_timestamp, fetchedAt: now }),
  };
}

function bucketDensityRows(rows, intervalMinutes) {
  if (intervalMinutes === 15) return rows;
  const buckets = new Map();
  const intervalMs = intervalMinutes * MINUTES_TO_MS;
  for (const row of rows) {
    const date = validDate(row.timestamp);
    if (!date) continue;
    const key = Math.floor(date.getTime() / intervalMs) * intervalMs;
    const bucket = buckets.get(key) || { total: 0, count: 0 };
    bucket.total += row.numberCSOsPerKm2;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b).map(([timestamp, bucket]) => ({
    timestamp: new Date(timestamp).toISOString(),
    numberCSOsPerKm2: bucket.total / bucket.count,
  }));
}

export async function getWaterQualityDensitySeries(hours = 120, endTime = new Date(), intervalMinutes = 15) {
  const { db } = await connectToDatabase();
  const collection = db.collection('waterQuality');
  const startTime = new Date(endTime.getTime() - hours * HOURS_TO_MS);
  const documents = await collection.find({ scrape_timestamp: { $gte: startTime, $lte: endTime } })
    .sort({ scrape_timestamp: 1 }).toArray();
  const rows = documents.map((data) => {
    const timestamp = data?.scrape_timestamp;
    const numberCSOsPerKm2 = Number(data?.water_quality?.number_CSOs_per_km2);
    return timestamp && Number.isFinite(numberCSOsPerKm2) ? { timestamp, numberCSOsPerKm2 } : null;
  }).filter(Boolean);
  return bucketDensityRows(rows, intervalMinutes);
}

export async function getCsoDetailsByIds(ids) {
  const normalizedIds = uniqueIds(ids);
  if (!normalizedIds.length) throw new HttpError(400, 'No valid ids provided');
  const { db } = await connectToDatabase();
  const records = await getLatestCsoRecords(db.collection('csoData'), normalizedIds);
  return Object.fromEntries([...records.entries()]);
}

export async function getCsoDetailsById(id) {
  if (!id) throw new HttpError(400, 'Missing id parameter');
  const result = await getCsoDetailsByIds([id]);
  if (!result[id]) throw new HttpError(404, 'CSO data not found');
  return result[id];
}
