import "server-only";
import { unstable_cache } from "next/cache";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import {
  assembleWaterQualitySnapshot,
  buildLegacyWaterQualityHealth,
  eventDurationMinutes,
  getCsoSourceMode,
  getLatestWaterQualitySnapshot,
  getLatestWaterQualitySummary,
  getSummaryMembership,
  isFresh,
  RECENT_EVENT_HOURS,
} from "../services/waterQualityService";
import { createRdpClient, CSO_STATUS_BATCH_LIMIT } from "./client.js";
import { RdpError } from "./errors.js";

// RDP CSO consumer adapter (#120). Server-only: the browser only ever sees the existing public shapes.
// Membership stays the legacy `CSO_IDs` list; RDP supplies identity, current status and event details.

export const CSO_PROVIDER = "severn-trent"; // The legacy membership is Severn Trent ArcGIS `Id`s only.
export const CSO_TIME_ALIGNMENT_SECONDS = 15 * 60; // One RDP status poll: source reports this close are comparable.
export const CSO_MAX_MEMBERS = 60; // Three status batches; anything beyond is reported, never silently read.
export const CSO_MAX_EVENT_READS = 20;
export const CSO_EVENT_PAGE_LIMIT = 100;
export const CSO_MAX_EVENT_PAGES = 3;
export const CSO_MAX_CATALOGUE_PAGES = 10;
export const CSO_MAX_DETAIL_IDS = 20;
export const CSO_READ_DEADLINE_MS = 12000;
export const CSO_SHADOW_DEADLINE_MS = 8000;
const EVENT_READ_CONCURRENCY = 4;
const HOUR_MS = 3600000;
const BUCKET_MS = 15 * 60000;
const SOURCE_NAME = "river-data-platform-cso";
const LEGACY_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

let client = null;
function getClient() {
  client ??= createRdpClient();
  return client;
}

// In-process coalescing on top of the cross-request data cache: concurrent misses share one read.
const inflight = new Map();
function coalesce(key, read) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve().then(read).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RdpError("TIMEOUT")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function errorCode(error) {
  return error instanceof RdpError ? error.code : "UNEXPECTED_ERROR";
}

async function readCatalogueUncached() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const assets = [];
    let cursor;
    let catalogues = [];
    try {
      for (let page = 0; page < CSO_MAX_CATALOGUE_PAGES; page++) {
        const result = await getClient().listCsoOutfalls({ limit: 1000, cursor });
        if (page === 0) catalogues = result.catalogues;
        assets.push(...result.assets);
        if (!result.nextCursor) {
          if (assets.length !== result.total) throw new RdpError("RESPONSE_CONTRACT_ERROR");
          return { assets, catalogues };
        }
        cursor = result.nextCursor;
      }
      throw new RdpError("RESULT_TOO_LARGE");
    } catch (error) {
      // A catalogue version change mid-walk invalidates the cursor; restart the walk once.
      if (attempt === 0 && error instanceof RdpError && error.code === "CURSOR_STALE") continue;
      throw error;
    }
  }
  throw new RdpError("CURSOR_STALE");
}

// Values cached here are public catalogue/status/event data, never credentials. Failures are not cached.
const readCachedCatalogue = unstable_cache(readCatalogueUncached, ["rdp-cso-catalogue-v1"], { revalidate: 6 * 3600, tags: ["rdp-cso"] });
const readCachedStatus = unstable_cache((ids) => getClient().getCsoStatus(ids), ["rdp-cso-status-v1"], { revalidate: 300, tags: ["rdp-cso"] });
const readCachedHealth = unstable_cache((id) => getClient().getCsoHealth(id), ["rdp-cso-health-v1"], { revalidate: 900, tags: ["rdp-cso"] });
const readCachedEvents = unstable_cache(async (id, from, to) => {
  const events = [];
  let cursor;
  let coverage = null;
  for (let page = 0; page < CSO_MAX_EVENT_PAGES; page++) {
    const result = await getClient().getCsoEvents(id, { from, to, limit: CSO_EVENT_PAGE_LIMIT, cursor });
    coverage ??= result.coverage;
    events.push(...result.events);
    if (!result.nextCursor) return { events, coverage, truncated: false };
    cursor = result.nextCursor;
  }
  return { events, coverage, truncated: true };
}, ["rdp-cso-events-v1"], { revalidate: 900, tags: ["rdp-cso"] });

const readCatalogue = () => coalesce("catalogue", readCachedCatalogue);
const readStatusBatch = (ids) => coalesce(`status:${ids.join(",")}`, () => readCachedStatus(ids));
const readEvents = (id, from, to) => coalesce(`events:${id}:${from}:${to}`, () => readCachedEvents(id, from, to));
const readHealth = (id) => coalesce(`health:${id}`, () => readCachedHealth(id));

// Aligned to 15-minute buckets so every request inside a bucket shares one cache key per outfall.
export function eventWindow(now) {
  const to = new Date(Math.ceil(now.getTime() / BUCKET_MS) * BUCKET_MS);
  const from = new Date(to.getTime() - RECENT_EVENT_HOURS * HOUR_MS - BUCKET_MS);
  return { from: from.toISOString().replace(".000Z", "Z"), to: to.toISOString().replace(".000Z", "Z") };
}

// Legacy provider `Id` -> canonical RDP asset. Exact `externalId` match within the Severn Trent catalogue
// only; zero matches is `missing`, more than one is `ambiguous`. Neither is ever guessed.
export function resolveCsoIdentities(legacyIds, assets) {
  const byExternal = new Map();
  for (const asset of assets) {
    if (asset.provider !== CSO_PROVIDER) continue;
    const list = byExternal.get(asset.externalId) ?? [];
    list.push(asset);
    byExternal.set(asset.externalId, list);
  }
  return new Map(legacyIds.map((id) => {
    const candidates = byExternal.get(id) ?? [];
    if (candidates.length === 1) return [id, { state: "mapped", assetId: candidates[0].assetId, asset: candidates[0] }];
    return [id, { state: candidates.length ? "ambiguous" : "missing", assetId: null, asset: null,
      candidates: candidates.map((asset) => asset.assetId) }];
  }));
}

function latestEvent(events) {
  return [...events].sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))[0] ?? null;
}

function sourceFresh(status, now) {
  return status.status === "available" && status.freshness === "fresh" && isFresh(status.sourceUpdatedAt, now);
}

// Maps one member to the legacy public location. `statusReason` is the only addition: it keeps stale,
// offline, unresolved, unavailable and confirmed-not-spilling distinguishable inside `unknown`.
export function classifyRdpLocation(legacyId, { identity, status, events }, { now }) {
  const asset = identity?.asset ?? null;
  const recentCutoff = new Date(now.getTime() - RECENT_EVENT_HOURS * HOUR_MS);
  const latest = events?.events ? latestEvent(events.events) : null;
  const base = {
    id: legacyId,
    status: "unknown",
    coordinates: Number.isFinite(asset?.longitude) && Number.isFinite(asset?.latitude) ? { x: asset.longitude, y: asset.latitude } : null,
    receivingWaterCourse: asset?.receivingWatercourse ?? null,
    latestEventStart: latest?.startedAt ?? null,
    latestEventEnd: latest?.endedAt ?? null,
    eventDurationMinutes: null,
    observedAt: status?.fetchedAt ?? null,
    sourceUpdatedAt: status?.sourceUpdatedAt ?? null,
  };
  // Same duration rule as the legacy classifier for non-active rows.
  const unknown = (statusReason) => ({ ...base, eventDurationMinutes: eventDurationMinutes(base.latestEventStart, base.latestEventEnd, now), statusReason });

  if (!identity || identity.state !== "mapped") return unknown(`identity_${identity?.state ?? "missing"}`);
  if (!status) return unknown(status === undefined ? "status_not_read" : "status_unavailable");
  if (status.status !== "available") return unknown(status.status);
  if (status.reportedState === "offline") return isFresh(status.sourceUpdatedAt, now) ? { ...unknown("offline"), status: "offline" } : unknown("stale");
  if (!sourceFresh(status, now)) return unknown("stale");

  // Only fresh, verified spilling evidence: RDP's effective state and the provider's reported state agree.
  if (status.effectiveState === "spilling" && status.reportedState === "spilling") {
    const ongoing = latest?.lifecycle === "ongoing" ? latest : null;
    const start = ongoing?.startedAt ?? status.statusStart;
    return { ...base, status: "active", latestEventStart: start, latestEventEnd: null,
      eventDurationMinutes: eventDurationMinutes(start, null, now), statusReason: "spilling" };
  }
  if (status.effectiveState !== "not_spilling" || status.reportedState !== "not_spilling") return unknown("contradictory");
  if (!events) return unknown("events_unavailable");
  if (!latest) return unknown(events.truncated ? "events_truncated" : "not_spilling_no_recent_event");
  if (latest.reconciliation === "held") return unknown("event_held");
  if (latest.lifecycle !== "completed" || latest.boundaryProvenance !== "provider_reported") return unknown(`event_${latest.lifecycle === "completed" ? "end_not_reported" : latest.lifecycle}`);
  if (new Date(latest.endedAt) >= recentCutoff) {
    return { ...base, status: "recent", eventDurationMinutes: eventDurationMinutes(latest.startedAt, latest.endedAt, null), statusReason: "recently_stopped" };
  }
  return unknown(events.truncated ? "events_truncated" : "not_spilling_no_recent_event");
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

// Never rejects. Returns per-member evidence plus the read diagnostics used by shadow and the admin report.
export async function readRdpCsoEvidence(legacyIds, now = new Date(), { includeHealth = false } = {}) {
  const failures = [];
  const evidence = new Map(legacyIds.map((id) => [id, { identity: null, status: undefined, events: null }]));
  const budget = { members: legacyIds.length, statusBatches: 0, eventReads: 0, healthReads: 0, skipped: [] };
  let catalogue;
  try {
    catalogue = await readCatalogue();
  } catch (error) {
    return { ok: false, error: errorCode(error), evidence, failures: [{ stage: "catalogue", code: errorCode(error) }], budget, catalogues: [] };
  }

  const identities = resolveCsoIdentities(legacyIds, catalogue.assets);
  for (const [id, identity] of identities) evidence.get(id).identity = identity;

  const mapped = legacyIds.filter((id) => identities.get(id).state === "mapped");
  const readable = mapped.slice(0, CSO_MAX_MEMBERS);
  budget.skipped.push(...mapped.slice(CSO_MAX_MEMBERS));
  const batches = [];
  for (let i = 0; i < readable.length; i += CSO_STATUS_BATCH_LIMIT) batches.push(readable.slice(i, i + CSO_STATUS_BATCH_LIMIT));
  budget.statusBatches = batches.length;

  let statusFailures = 0;
  await Promise.all(batches.map(async (batch) => {
    const assetIds = batch.map((id) => identities.get(id).assetId);
    try {
      const result = await readStatusBatch(assetIds);
      result.rows.forEach((row, index) => { evidence.get(batch[index]).status = row; });
      if (result.partial) failures.push({ stage: "status", code: "PARTIAL", ids: batch.filter((_, i) => result.rows[i].status === "unavailable") });
    } catch (error) {
      statusFailures += 1;
      batch.forEach((id) => { evidence.get(id).status = null; });
      failures.push({ stage: "status", code: errorCode(error), ids: batch });
    }
  }));

  // Events only where they can change the answer: a fresh spilling or fresh not-spilling report.
  const window = eventWindow(now);
  const eventIds = readable.filter((id) => {
    const status = evidence.get(id).status;
    return status && sourceFresh(status, now) && status.effectiveState !== "unknown";
  });
  budget.skipped.push(...eventIds.slice(CSO_MAX_EVENT_READS));
  const eventTargets = eventIds.slice(0, CSO_MAX_EVENT_READS);
  budget.eventReads = eventTargets.length;
  await mapLimit(eventTargets, EVENT_READ_CONCURRENCY, async (id) => {
    try {
      evidence.get(id).events = await readEvents(identities.get(id).assetId, window.from, window.to);
    } catch (error) {
      failures.push({ stage: "events", code: errorCode(error), ids: [id] });
    }
  });

  if (includeHealth) {
    const healthTargets = readable.slice(0, CSO_STATUS_BATCH_LIMIT);
    budget.healthReads = healthTargets.length;
    await mapLimit(healthTargets, EVENT_READ_CONCURRENCY, async (id) => {
      try {
        evidence.get(id).health = await readHealth(identities.get(id).assetId);
      } catch (error) {
        evidence.get(id).health = null;
        failures.push({ stage: "health", code: errorCode(error), ids: [id] });
      }
    });
  }

  const allStatusFailed = batches.length > 0 && statusFailures === batches.length;
  return { ok: !allStatusFailed, error: allStatusFailed ? failures.find((f) => f.stage === "status").code : null,
    evidence, failures, budget, catalogues: catalogue.catalogues, window };
}

function seconds(a, b) {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isFinite(left) && Number.isFinite(right) ? Math.round((left - right) / 1000) : null;
}

function iso(value) {
  const time = value ? Date.parse(value instanceof Date ? value.toISOString() : value) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

// One member, legacy vs RDP, at compatible timestamps. A difference is evidence to review, not proof
// that either source is right; an incomparable pair is reported as such rather than counted as agreement.
export function compareCsoLocation(legacy, rdp, member) {
  const identity = member.identity;
  const status = member.status ?? null;
  const legacySource = iso(legacy?.sourceUpdatedAt);
  const rdpSource = iso(status?.sourceUpdatedAt);
  const lagSeconds = legacySource && rdpSource ? seconds(rdpSource, legacySource) : null;
  const row = {
    id: legacy.id,
    assetId: identity?.assetId ?? null,
    identity: identity?.state ?? "missing",
    ...(identity?.candidates?.length ? { candidates: identity.candidates } : {}),
    selected: identity?.asset ? identity.asset.selected : null,
    legacyStatus: legacy.status,
    rdpStatus: rdp.status,
    rdpReason: rdp.statusReason,
    rdpReportedState: status?.reportedState ?? null,
    rdpEffectiveState: status?.effectiveState ?? null,
    rdpFreshness: status?.freshness ?? null,
    legacySourceUpdatedAt: legacySource,
    rdpSourceUpdatedAt: rdpSource,
    legacyObservedAt: iso(legacy.observedAt),
    rdpFetchedAt: status?.fetchedAt ?? null,
    sourceLagSeconds: lagSeconds,
    rdpSourceAgeSeconds: status?.sourceAgeSeconds ?? null,
    coverage: member.events?.coverage ? { status: member.events.coverage.status, gaps: member.events.coverage.gaps.length } : null,
    ...(member.health !== undefined ? { health: member.health && {
      selection: member.health.selection.state, catalogue: member.health.catalogue.state,
      coverageLast24h: member.health.coverageLast24h?.status ?? null, gaps24h: member.health.coverageLast24h?.gaps.length ?? null,
    } } : {}),
  };

  if (row.identity !== "mapped") return { ...row, outcome: `identity_${row.identity}` };
  if (status === null || status === undefined) return { ...row, outcome: "rdp_failed" };
  if (lagSeconds === null || Math.abs(lagSeconds) > CSO_TIME_ALIGNMENT_SECONDS) return { ...row, outcome: "not_comparable" };
  if (legacy.status !== rdp.status) return { ...row, outcome: "status_mismatch" };
  const eventFields = legacy.status === "active" ? ["latestEventStart"] : legacy.status === "recent" ? ["latestEventStart", "latestEventEnd"] : [];
  const eventDiffs = eventFields.filter((field) => iso(legacy[field]) !== iso(rdp[field]))
    .map((field) => ({ field, legacy: iso(legacy[field]), rdp: iso(rdp[field]) }));
  return eventDiffs.length ? { ...row, outcome: "event_mismatch", eventDiffs } : { ...row, outcome: "match" };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function summariseCsoComparison(rows) {
  const tally = (key) => rows.reduce((counts, row) => ({ ...counts, [row[key]]: (counts[row[key]] ?? 0) + 1 }), {});
  const lags = rows.map((row) => row.sourceLagSeconds).filter(Number.isFinite);
  const ages = rows.map((row) => row.rdpSourceAgeSeconds).filter(Number.isFinite);
  return {
    members: rows.length,
    outcomes: tally("outcome"),
    rdpReasons: tally("rdpReason"),
    unknowns: rows.filter((row) => row.rdpStatus === "unknown").length,
    sourceLagSeconds: { median: median(lags), maxAbs: lags.length ? Math.max(...lags.map(Math.abs)) : null, samples: lags.length },
    rdpSourceAgeSeconds: { median: median(ages), max: ages.length ? Math.max(...ages) : null },
    notSelectedForPolling: rows.filter((row) => row.selected === false).map((row) => row.id),
  };
}

function buildRdpLocations(legacyIds, read, now) {
  return legacyIds.map((id) => classifyRdpLocation(id, read.evidence.get(id), { now }));
}

// Legacy stays authoritative and is returned unchanged. The RDP read cannot reject, has a deadline,
// writes nothing and only produces a log line.
export async function getShadowWaterQualitySnapshot(now = new Date()) {
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso-shadow");
  const legacy = await getLatestWaterQualitySnapshot(now);
  if (!legacy) return legacy;
  try {
    const report = await buildComparison(legacy, now, { deadlineMs: CSO_SHADOW_DEADLINE_MS });
    logger.info(`RDP CSO shadow comparison ${JSON.stringify({ comparedAt: report.comparedAt, rdp: report.rdp, summary: report.summary,
      differences: report.locations.filter((row) => row.outcome !== "match") })}`);
  } catch {
    logger.warn("RDP CSO shadow comparison failed");
  }
  return legacy;
}

async function buildComparison(legacy, now, { deadlineMs, includeHealth = false }) {
  const ids = legacy.WaterQuality.CSOIds;
  let read;
  try {
    read = await withDeadline(readRdpCsoEvidence(ids, now, { includeHealth }), deadlineMs);
  } catch (error) {
    read = { ok: false, error: errorCode(error), evidence: new Map(ids.map((id) => [id, { identity: null, status: null }])),
      failures: [{ stage: "deadline", code: errorCode(error) }], budget: null, catalogues: [] };
  }
  const rdpLocations = buildRdpLocations(ids, read, now);
  const rows = legacy.locations.map((location, index) => compareCsoLocation(location, rdpLocations[index], read.evidence.get(location.id) ?? {}));
  return {
    comparedAt: now.toISOString(),
    mode: getCsoSourceMode() ?? "invalid",
    legacy: { summaryId: legacy.Id, scrapeTimestamp: iso(legacy.ScrapeTimestamp), health: legacy.health, statusSummary: legacy.statusSummary },
    rdp: { ok: read.ok, error: read.error, failures: read.failures, budget: read.budget, catalogues: read.catalogues, eventWindow: read.window ?? null },
    summary: summariseCsoComparison(rows),
    locations: rows,
  };
}

// Read-only diagnostic for the protected admin route: identity, status, lag, unknowns and failures.
export async function getCsoShadowReport(now = new Date()) {
  const legacy = await getLatestWaterQualitySnapshot(now);
  if (!legacy) throw new HttpError(404, "No water quality summary available");
  return buildComparison(legacy, now, { deadlineMs: CSO_READ_DEADLINE_MS * 2, includeHealth: true });
}

// RDP-authoritative current status over the legacy membership. A total RDP failure serves the whole legacy
// snapshot, marked `fallback`, rather than mixing sources per location.
export async function getRdpWaterQualitySnapshot(now = new Date()) {
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso");
  const latest = await getLatestWaterQualitySummary();
  if (!latest) return null;
  const ids = getSummaryMembership(latest);
  let read;
  try {
    read = await withDeadline(readRdpCsoEvidence(ids, now), CSO_READ_DEADLINE_MS);
  } catch (error) {
    read = { ok: false, error: errorCode(error), failures: [] };
  }
  if (!read.ok && ids.length) {
    logger.warn(`RDP CSO unavailable; serving legacy ${JSON.stringify({ error: read.error })}`);
    const legacy = await getLatestWaterQualitySnapshot(now);
    return { ...legacy, health: { ...buildLegacyWaterQualityHealth(latest, now, { fallback: true }), cso: { origin: "legacy", rdpError: read.error } } };
  }
  if (read.failures.length) logger.warn(`RDP CSO read degraded ${JSON.stringify({ failures: read.failures.map(({ stage, code }) => ({ stage, code })) })}`);
  const locations = buildRdpLocations(ids, read, now);
  // Membership age still bounds trust in the population, so health is stale whenever the summary is.
  const health = { ...buildLegacyWaterQualityHealth(latest, now), source: SOURCE_NAME,
    cso: { origin: "rdp", partial: read.failures.length > 0, unknown: locations.filter((l) => l.status === "unknown").length } };
  return assembleWaterQualitySnapshot(latest, locations, now, health);
}

// `/api/waterquality/cso*` compatibility: the legacy record shape built from RDP evidence. `Status` is the
// effective state (1/0) or a fresh offline report (-1); anything unverified is `null`, never 0.
function toLegacyRecord(id, member, now) {
  const location = classifyRdpLocation(id, member, { now });
  const status = member.status;
  let code = null;
  if (location.status === "active") code = 1;
  else if (location.status === "offline") code = -1;
  else if (status && sourceFresh(status, now) && status.effectiveState === "not_spilling" && status.reportedState === "not_spilling") code = 0;
  return {
    Id: id,
    Status: code,
    StatusStart: status?.statusStart ?? null,
    LatestEventStart: location.latestEventStart,
    LatestEventEnd: location.latestEventEnd,
    LastUpdated: status?.sourceUpdatedAt ?? null,
    ReceivingWaterCourse: location.receivingWaterCourse,
    DateScraped: status?.fetchedAt ?? null,
    Coordinates: location.coordinates ?? undefined,
  };
}

export async function getRdpCsoDetailsByIds(ids, now = new Date()) {
  if (ids.length > CSO_MAX_DETAIL_IDS) throw new HttpError(400, `At most ${CSO_MAX_DETAIL_IDS} ids are supported`);
  if (!ids.every((id) => LEGACY_ID.test(id))) throw new HttpError(400, "No valid ids provided");
  const read = await withDeadline(readRdpCsoEvidence(ids, now), CSO_READ_DEADLINE_MS).catch((error) => ({ ok: false, error: errorCode(error) }));
  if (!read.ok) throw new HttpError(503, "CSO data temporarily unavailable");
  // Unmapped or unread members are absent, like an ID with no legacy `csoData` record.
  return Object.fromEntries(ids.filter((id) => read.evidence.get(id)?.status).map((id) => [id, toLegacyRecord(id, read.evidence.get(id), now)]));
}

export function __resetRdpCsoStateForTests() {
  client = null;
  inflight.clear();
}
