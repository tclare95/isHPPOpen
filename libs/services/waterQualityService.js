import { connectToDatabase } from '../database';
import { HttpError } from '../api/http';
import { buildOperationalHealth } from '../operationalHealth';
import { createRequestLogger } from '../api/logger';

const HOURS_TO_MS = 60 * 60 * 1000;
const MINUTES_TO_MS = 60 * 1000;
export const STATUS_FRESHNESS_MINUTES = 30;
const STATUS_QUERY_WINDOW_MINUTES = 60;
export const RECENT_EVENT_HOURS = 48;

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim()))];
}

export function isFresh(value, now, minutes = STATUS_FRESHNESS_MINUTES) {
  const date = validDate(value);
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= -5 * MINUTES_TO_MS && age <= minutes * MINUTES_TO_MS;
}

export function eventDurationMinutes(startValue, endValue, fallbackEnd) {
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

async function readLatestSummary(db) {
  return db.collection('waterQuality').find().sort({ scrape_timestamp: -1 }).limit(1).next();
}

// The HPP membership list stays the legacy Node-written `CSO_IDs` (#120 keeps membership on legacy).
export function getSummaryMembership(latest) {
  return uniqueIds(latest?.water_quality?.CSO_IDs);
}

// Shared by the legacy and RDP-backed paths so both emit exactly the same public snapshot shape.
export function assembleWaterQualitySnapshot(latest, locations, now, health) {
  const waterQuality = latest.water_quality || {};
  const recentCutoff = new Date(now.getTime() - RECENT_EVENT_HOURS * HOURS_TO_MS);
  const count = (status) => locations.filter((location) => location.status === status).length;
  const activeLocations = locations.filter((location) => location.status === 'active');
  return {
    Id: latest.id ?? null,
    ScrapeTimestamp: latest.scrape_timestamp ?? null,
    WaterQuality: {
      NumberUpstreamCSOs: Number(waterQuality.number_upstream_CSOs) || 0,
      NumberCSOsPerKm2: Number(waterQuality.number_CSOs_per_km2) || 0,
      CSOIds: getSummaryMembership(latest),
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
    health,
  };
}

export function buildLegacyWaterQualityHealth(latest, now, options = {}) {
  return buildOperationalHealth({ source: 'mongodb-water-quality', generatedAt: latest.scrape_timestamp, fetchedAt: now, ...options });
}

// Legacy (Mongo `waterQuality` + `csoData`) snapshot: the `legacy` mode, shadow comparison and admin
// diagnostics only. It never depends on RDP_CSO_SOURCE.
export async function getLatestWaterQualitySnapshot(now = new Date()) {
  const { db } = await connectToDatabase();
  const latest = await readLatestSummary(db);
  if (!latest) return null;
  const csoIds = getSummaryMembership(latest);
  const summaryFresh = isFresh(latest.scrape_timestamp, now);
  const querySince = new Date(now.getTime() - STATUS_QUERY_WINDOW_MINUTES * MINUTES_TO_MS);
  const recentCutoff = new Date(now.getTime() - RECENT_EVENT_HOURS * HOURS_TO_MS);
  const records = await getLatestCsoRecords(db.collection('csoData'), csoIds, { since: querySince });
  const locations = csoIds.map((id) => classifyLocation(id, records.get(id), { now, summaryFresh, recentCutoff }));
  return assembleWaterQualitySnapshot(latest, locations, now, buildLegacyWaterQualityHealth(latest, now));
}

// Membership summary only (no csoData read), for the RDP-backed path.
export async function getLatestWaterQualitySummary() {
  const { db } = await connectToDatabase();
  return readLatestSummary(db);
}

// Summary identity and freshness only, with the same health as the legacy snapshot (#68 CSO retirement).
// Alert evaluation and operational health use only these fields, so they never read `csoData` and keep
// working in every RDP_CSO_SOURCE mode after the legacy CSO collection stops.
export async function getLatestWaterQualitySummaryHealth(now = new Date()) {
  const latest = await getLatestWaterQualitySummary();
  if (!latest) return null;
  return { Id: latest.id ?? null, ScrapeTimestamp: latest.scrape_timestamp ?? null, health: buildLegacyWaterQualityHealth(latest, now) };
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

// ---- Read-only legacy history for the catchment comparison (#114). Never used by the indicator or alerts. ----
export const LEGACY_HISTORY_MAX_ROWS = 2000;
export const LEGACY_STATUS_MAX_ROWS = 20000;

// Legacy summaries in [from, to], oldest first, at their own observation time (`scrape_timestamp`).
export async function getLegacyWaterQualityObservations(from, to) {
  const { db } = await connectToDatabase();
  const documents = await db.collection('waterQuality').find(
    { scrape_timestamp: { $gte: new Date(from), $lte: new Date(to) } },
    { projection: { scrape_timestamp: 1, 'water_quality.number_CSOs_per_km2': 1, 'water_quality.number_upstream_CSOs': 1, 'water_quality.CSO_IDs': 1 } },
  ).sort({ scrape_timestamp: 1 }).limit(LEGACY_HISTORY_MAX_ROWS).toArray();
  return documents.map((doc) => {
    const observedAt = validDate(doc?.scrape_timestamp);
    if (!observedAt) return null;
    const density = Number(doc.water_quality?.number_CSOs_per_km2);
    const upstream = Number(doc.water_quality?.number_upstream_CSOs);
    return {
      observedAt: observedAt.toISOString(),
      numberCSOsPerKm2: Number.isFinite(density) ? density : null,
      numberUpstreamCSOs: Number.isFinite(upstream) ? upstream : null,
      csoIds: uniqueIds(doc.water_quality?.CSO_IDs),
    };
  }).filter(Boolean);
}

// Legacy per-outfall status records (`csoData`) for the given provider IDs in [from, to], oldest first.
export async function getLegacyCsoStatusHistory(ids, from, to) {
  const normalizedIds = uniqueIds(ids);
  if (!normalizedIds.length) return [];
  const { db } = await connectToDatabase();
  const documents = await db.collection('csoData').find(
    { 'attributes.Id': { $in: normalizedIds }, DateScraped: { $gte: new Date(from), $lte: new Date(to) } },
    { projection: { DateScraped: 1, 'attributes.Id': 1, 'attributes.Status': 1 } },
  ).sort({ DateScraped: 1 }).limit(LEGACY_STATUS_MAX_ROWS).toArray();
  return documents.map((doc) => {
    const scrapedAt = validDate(doc?.DateScraped);
    const status = Number(doc?.attributes?.Status);
    return scrapedAt && typeof doc.attributes?.Id === 'string'
      ? { id: doc.attributes.Id, scrapedAt: scrapedAt.toISOString(), status: Number.isFinite(status) ? status : null } : null;
  }).filter(Boolean);
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

// ---- RDP_CSO_SOURCE (#120): public water-quality routes only ----
// Alert evaluation and operational health call getLatestWaterQualitySummaryHealth() in every mode.
const CSO_SOURCE_MODES = ['legacy', 'shadow', 'rdp'];

export function getCsoSourceMode(env = process.env) {
  const mode = env.RDP_CSO_SOURCE ?? 'legacy';
  return CSO_SOURCE_MODES.includes(mode) ? mode : null;
}

function resolveCsoMode() {
  const mode = getCsoSourceMode();
  if (mode === null) createRequestLogger({ method: 'GET' }, 'rdp/cso').error('Invalid RDP_CSO_SOURCE; serving legacy');
  return mode ?? 'legacy';
}

export async function getPublicWaterQualitySnapshot() {
  const mode = resolveCsoMode();
  if (mode === 'legacy') return getLatestWaterQualitySnapshot();
  // Loaded only outside legacy so the default path never touches the server-only RDP client.
  const { getRdpWaterQualitySnapshot, getShadowWaterQualitySnapshot } = await import('../rdp/csoSource');
  return mode === 'rdp' ? getRdpWaterQualitySnapshot() : getShadowWaterQualitySnapshot();
}

export async function getPublicCsoDetailsByIds(ids) {
  if (resolveCsoMode() !== 'rdp') return getCsoDetailsByIds(ids);
  const normalizedIds = uniqueIds(ids);
  if (!normalizedIds.length) throw new HttpError(400, 'No valid ids provided');
  const { getRdpCsoDetailsByIds } = await import('../rdp/csoSource');
  return getRdpCsoDetailsByIds(normalizedIds);
}

export async function getPublicCsoDetailsById(id) {
  if (resolveCsoMode() !== 'rdp') return getCsoDetailsById(id);
  if (!id) throw new HttpError(400, 'Missing id parameter');
  const result = await getPublicCsoDetailsByIds([id]);
  if (!result[id]) throw new HttpError(404, 'CSO data not found');
  return result[id];
}

// ---- RDP_CSO_HISTORY (#121): recorded event history section, independent of RDP_CSO_SOURCE ----
// Off unless exactly `on`. Never read by the indicator, density or alert evaluation.
export function isCsoHistoryEnabled(env = process.env) {
  return env.RDP_CSO_HISTORY === 'on';
}

export async function getPublicCsoEventHistory(windowKey) {
  if (!isCsoHistoryEnabled()) return { enabled: false };
  const { getCsoEventHistory } = await import('../rdp/csoHistory');
  return { enabled: true, ...(await getCsoEventHistory(windowKey)) };
}

// ---- RDP_CSO_CATCHMENT (#114): optional whole-catchment monitoring section ----
// Off unless exactly `on`. Descriptive only: never read by the indicator, density chart, thresholds or alerts.
export function isCsoCatchmentEnabled(env = process.env) {
  return env.RDP_CSO_CATCHMENT === 'on';
}

export async function getPublicCsoCatchmentMonitoring(setKey) {
  if (!isCsoCatchmentEnabled()) return { enabled: false };
  const { getCatchmentMonitoring } = await import('../rdp/csoCatchment');
  return { enabled: true, ...(await getCatchmentMonitoring(setKey)) };
}

export async function getPublicCsoEventDetail(eventId) {
  if (!isCsoHistoryEnabled()) throw new HttpError(404, 'Event history is not enabled');
  const { getCsoEventDetail } = await import('../rdp/csoHistory');
  return getCsoEventDetail(eventId);
}
