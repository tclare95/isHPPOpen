import "server-only";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import {
  classifyLocation, getCsoDetailsByIds, getLatestWaterQualitySummary, getSummaryMembership, isFresh, RECENT_EVENT_HOURS,
} from "../services/waterQualityService";
import { riverImpactEnabled } from "../services/riverImpactService";
import {
  classifyRdpLocation, CSO_PROVIDER, CSO_READ_DEADLINE_MS, errorCode, eventWindow, readCatalogue, readEvents, readStatusBatch,
  resolveCsoIdentities, withDeadline,
} from "./csoSource.js";
import { HPP_MEMBERSHIP, MEMBERSHIP_DEADLINE_MS, readHppMembership } from "./csoMembership.js";
import {
  assessHistory, CSO_HISTORY_DEADLINE_MS, describeEvent, historyWindow, newestFirst, providerLabel, readEventPages, summariseCoverage,
} from "./csoHistory.js";
import { CSO_ASSET_ID } from "./csoContract.js";

// One storm overflow in focus (Wave C / C4, `/waterquality/cso/{id}`). Server-only, read-only and bounded to ONE outfall:
// one cached membership/catalogue lookup, at most one status read, one recent-events read for classification and one
// event-history read. Never a general RDP proxy: only outfalls in the HPP membership in use (the legacy `CSO_IDs` list, or
// any scope of the pinned RDP relationship set) resolve; anything else is 404.
//
// Each section reports its own availability, so a disabled flag or a failed source never fails the whole view, and a
// missing, stale or unread status is never presented as "not spilling". Never read by the indicator, thresholds or alerts.

export const OUTFALL_DETAIL_WINDOWS = Object.freeze(["48h", "7d", "30d"]);
export const OUTFALL_DETAIL_DEFAULT_WINDOW = "48h";
// Other catalogue outfalls at the same published coordinates (5 decimal places, RDP's own co-location rule), listed so a
// shared map pin is never mistaken for one outfall.
export const CO_LOCATED_LIMIT = 20;
const LEGACY_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const notFound = (message = "Outfall not found") => new HttpError(404, message);

// A canonical asset ID (`provider:source:externalId`) or, for old links and the legacy map, a provider-native ID.
export function parseOutfallId(raw) {
  if (typeof raw !== "string" || raw.length > 200) throw notFound();
  if (CSO_ASSET_ID.test(raw)) return { assetId: raw, externalId: raw.slice(raw.lastIndexOf(":") + 1) };
  if (LEGACY_ID.test(raw)) return { assetId: null, externalId: raw };
  throw notFound();
}

const placeKey = (latitude, longitude) => (Number.isFinite(latitude) && Number.isFinite(longitude)
  ? `${latitude.toFixed(5)},${longitude.toFixed(5)}` : null);
const coordinatesOf = (longitude, latitude) => (Number.isFinite(longitude) && Number.isFinite(latitude) ? { x: longitude, y: latitude } : null);

// ---- Scope: which membership the site is using, and whether this outfall is in it ----

async function resolveRdpScope(requested) {
  let set;
  try {
    set = await withDeadline(readHppMembership(), MEMBERSHIP_DEADLINE_MS);
  } catch (error) {
    createRequestLogger({ method: "GET" }, "rdp/cso-outfall").warn(`RDP HPP membership unavailable for outfall detail ${JSON.stringify({ code: errorCode(error) })}`);
    throw new HttpError(503, "Outfall details are temporarily unavailable");
  }
  const matches = set.members.filter((member) => (requested.assetId ? member.assetId === requested.assetId : member.externalId === requested.externalId));
  if (matches.length > 1) throw notFound("This provider ID matches more than one outfall; open it from the map or spill history instead");
  const member = matches[0];
  if (!member) throw notFound();
  const inScope = new Map(set.members.map((entry) => [entry.assetId, { publicId: entry.id, category: entry.category }]));
  return {
    member: { publicId: member.id, assetId: member.assetId, provider: member.providerId, sourceId: member.sourceId, externalId: member.externalId,
      coordinates: coordinatesOf(member.longitude, member.latitude), receivingWatercourse: member.receivingWatercourse },
    relationship: {
      basis: "rdp", category: member.category, primary: member.category === HPP_MEMBERSHIP.primaryScope, reason: member.reason,
      reviewed: member.reviewed, routed: member.routed, relationshipSet: set.setId, version: set.version, approval: set.review.approval,
      network: set.network,
    },
    scopeOf: (asset) => inScope.get(asset.assetId) ?? null,
    latest: undefined,
  };
}

async function resolveLegacyScope(requested) {
  let latest;
  try {
    latest = await getLatestWaterQualitySummary();
  } catch {
    throw new HttpError(503, "Outfall details are temporarily unavailable");
  }
  const ids = new Set(latest ? getSummaryMembership(latest) : []);
  // The legacy list is Severn Trent ArcGIS IDs only; a canonical ID must name that provider.
  if (requested.assetId && !requested.assetId.startsWith(`${CSO_PROVIDER}:`)) throw notFound();
  if (!ids.has(requested.externalId)) throw notFound();
  return {
    member: { publicId: requested.externalId, assetId: requested.assetId, provider: CSO_PROVIDER, sourceId: null, externalId: requested.externalId,
      coordinates: null, receivingWatercourse: null },
    relationship: { basis: "legacy", category: "legacy", primary: true, reason: "sewage-map-cso-ids", reviewed: false, routed: null },
    scopeOf: (asset) => (asset.provider === CSO_PROVIDER && ids.has(asset.externalId) ? { publicId: asset.externalId, category: "legacy" } : null),
    latest,
  };
}

// ---- Identity: the canonical catalogue entry and any co-located outfalls ----

async function readIdentity(scope, requested) {
  const { member } = scope;
  let catalogue;
  try {
    catalogue = await withDeadline(readCatalogue(), CSO_READ_DEADLINE_MS);
  } catch (error) {
    return { state: "unavailable", errorCode: errorCode(error), asset: null, coLocated: null };
  }
  let asset;
  if (member.assetId) asset = catalogue.assets.find((entry) => entry.assetId === member.assetId) ?? null;
  else {
    const identity = resolveCsoIdentities([member.externalId], catalogue.assets).get(member.externalId);
    if (identity.state !== "mapped") return { state: identity.state, asset: null, coLocated: null };
    asset = identity.asset;
  }
  // A canonical ID the published catalogue does not hold (for example another source with the same provider ID).
  if (!asset) return { state: "missing", asset: null, coLocated: null };
  if (requested.assetId && asset.assetId !== requested.assetId) throw notFound();
  const key = placeKey(asset.latitude, asset.longitude);
  const coLocated = key ? catalogue.assets.filter((entry) => entry.assetId !== asset.assetId && placeKey(entry.latitude, entry.longitude) === key) : [];
  return {
    state: "resolved",
    asset,
    attribution: catalogue.catalogues.find((entry) => entry.provider === asset.provider && entry.sourceId === asset.sourceId)?.attribution ?? null,
    coLocatedTotal: coLocated.length,
    coLocated: coLocated.slice(0, CO_LOCATED_LIMIT).map((entry) => {
      const inScope = scope.scopeOf(entry);
      return { assetId: entry.assetId, externalId: entry.externalId, provider: entry.provider, providerLabel: providerLabel(entry.provider),
        name: entry.name, receivingWatercourse: entry.receivingWatercourse, inScope: Boolean(inScope), category: inScope?.category ?? null };
    }),
  };
}

// ---- Current status: the same classification rules as the map and status cards ----

const legacyReason = (location, record, summaryFresh, now) => {
  if (!record) return "no_status_record";
  if (!isFresh(record.DateScraped, now)) return "stale";
  if (location.status === "active") return "spilling";
  if (location.status === "recent") return "recently_stopped";
  if (location.status === "offline") return "offline";
  if (Number(record.Status) === 1 && !summaryFresh) return "stale";
  if (Number(record.Status) === 0) return "not_spilling_no_recent_event";
  return "unrecognised";
};

async function readLegacyStatus(scope, now) {
  const { externalId } = scope.member;
  try {
    const latest = scope.latest === undefined ? await getLatestWaterQualitySummary() : scope.latest;
    const record = (await getCsoDetailsByIds([externalId]))[externalId] ?? null;
    const summaryFresh = isFresh(latest?.scrape_timestamp, now);
    const recentCutoff = new Date(now.getTime() - RECENT_EVENT_HOURS * 3600000);
    const location = classifyLocation(externalId, record, { now, summaryFresh, recentCutoff });
    return { enabled: true, source: "legacy", state: "available", location: { ...location, statusReason: legacyReason(location, record, summaryFresh, now) },
      report: null };
  } catch {
    return { enabled: true, source: "legacy", state: "unavailable", errorCode: "LEGACY_STATUS_UNAVAILABLE" };
  }
}

async function readRdpStatus(member, assetId, now) {
  if (!assetId) return { enabled: true, source: "rdp", state: "unavailable", errorCode: "IDENTITY_UNRESOLVED" };
  let row;
  try {
    row = (await withDeadline(readStatusBatch([assetId]), CSO_READ_DEADLINE_MS)).rows[0];
  } catch (error) {
    return { enabled: true, source: "rdp", state: "unavailable", errorCode: errorCode(error) };
  }
  // Events only where they can change the answer (as on the map): an available, non-unknown report.
  let events = null;
  if (row.status === "available" && row.effectiveState !== "unknown") {
    const window = eventWindow(now);
    events = await withDeadline(readEvents(assetId, window.from, window.to), CSO_READ_DEADLINE_MS).catch(() => null);
  }
  const asset = { longitude: member.coordinates?.x, latitude: member.coordinates?.y, receivingWatercourse: member.receivingWatercourse };
  const location = classifyRdpLocation(member.publicId, { identity: { state: "mapped", assetId, asset }, status: row, events }, { now });
  return {
    enabled: true, source: "rdp", state: "available", location,
    report: { status: row.status, reportedState: row.reportedState, effectiveState: row.effectiveState, freshness: row.freshness,
      statusStart: row.statusStart, sourceUpdatedAt: row.sourceUpdatedAt, sourceAgeSeconds: row.sourceAgeSeconds, fetchedAt: row.fetchedAt },
  };
}

// ---- Recorded events for this one outfall (RDP_CSO_HISTORY) ----

async function readOutfallHistory(assetId, selected, windowKey, now) {
  const window = historyWindow(windowKey, now);
  const base = { enabled: true, window };
  if (!assetId) return { ...base, state: "unavailable", errorCode: "IDENTITY_UNRESOLVED", events: [] };
  const outfall = { id: assetId, assetId };
  // RDP only reconstructs events for outfalls it collects; an unselected outfall is "not monitored", never "no spills".
  if (selected === false) {
    const outfalls = [{ ...outfall, state: "not_monitored" }];
    return { ...base, state: "available", outfall: outfalls[0], events: [], evidence: assessHistory({ outfalls, events: [], window }) };
  }
  let result;
  try {
    result = await withDeadline(readEventPages(assetId, window.from, window.to), CSO_HISTORY_DEADLINE_MS);
  } catch (error) {
    return { ...base, state: "unavailable", errorCode: errorCode(error), events: [] };
  }
  const read = { ...outfall, state: "read", truncated: result.truncated, ...(result.truncated ? { readThrough: result.readThrough } : {}),
    coverage: summariseCoverage(result.coverage, window.from, window.to, result.requestAsOf), eventCount: result.events.length };
  const events = result.events.map((event) => ({ ...describeEvent(event, { from: window.from, asOf: result.requestAsOf }), assetId, asOf: result.requestAsOf }))
    .sort(newestFirst);
  return { ...base, state: "available", outfall: read, events, evidence: assessHistory({ outfalls: [read], events, window }) };
}

// ---- The detail ----

export async function getCsoOutfallDetail(rawId, { windowKey = OUTFALL_DETAIL_DEFAULT_WINDOW, sourceMode, membershipMode, historyEnabled,
  env = process.env, now = new Date() } = {}) {
  if (!OUTFALL_DETAIL_WINDOWS.includes(windowKey)) throw new HttpError(400, `window must be one of ${OUTFALL_DETAIL_WINDOWS.join(", ")}`);
  const requested = parseOutfallId(rawId);
  const impactEnabled = riverImpactEnabled(env);
  const scope = membershipMode === "rdp" ? await resolveRdpScope(requested) : await resolveLegacyScope(requested);
  // The legacy-only configuration never reads RDP: it has no canonical catalogue, so identity is the provider ID.
  const usesRdp = sourceMode !== "legacy" || membershipMode === "rdp" || historyEnabled || impactEnabled;
  const identity = usesRdp ? await readIdentity(scope, requested) : { state: "not_read", asset: null, coLocated: null };
  const asset = identity.asset;
  const assetId = asset?.assetId ?? scope.member.assetId ?? null;

  const member = { ...scope.member, coordinates: scope.member.coordinates ?? coordinatesOf(asset?.longitude, asset?.latitude),
    receivingWatercourse: scope.member.receivingWatercourse ?? asset?.receivingWatercourse ?? null };
  const [status, history] = await Promise.all([
    sourceMode === "rdp" ? readRdpStatus(member, assetId, now) : readLegacyStatus(scope, now),
    historyEnabled ? readOutfallHistory(assetId, asset ? asset.selected : null, windowKey, now) : Promise.resolve({ enabled: false }),
  ]);

  const provider = asset?.provider ?? member.provider;
  const coordinates = member.coordinates ?? status.location?.coordinates ?? null;
  return {
    id: assetId ?? scope.member.externalId,
    publicId: scope.member.publicId,
    outfall: {
      assetId,
      externalId: scope.member.externalId,
      provider,
      providerLabel: provider ? providerLabel(provider) : null,
      sourceId: asset?.sourceId ?? scope.member.sourceId ?? null,
      name: asset?.name ?? null,
      receivingWatercourse: member.receivingWatercourse ?? status.location?.receivingWaterCourse ?? null,
      coordinates,
      catalogueVersion: asset?.catalogueVersion ?? null,
      selected: asset ? asset.selected : null,
      attribution: identity.attribution ?? null,
    },
    identity: { state: identity.state, ...(identity.errorCode ? { errorCode: identity.errorCode } : {}) },
    coLocated: identity.coLocated,
    coLocatedTotal: identity.coLocatedTotal ?? null,
    relationship: scope.relationship,
    status,
    history,
    // Connectivity only. The route itself is drawn by the existing map overlay; this says whether it can be.
    connectivity: { impactEnabled, routed: scope.relationship.routed },
    sources: { csoSource: sourceMode, membership: membershipMode, history: historyEnabled, riverImpact: impactEnabled },
    retrievedAt: now.toISOString(),
  };
}
