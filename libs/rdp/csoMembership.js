import "server-only";
import { unstable_cache } from "next/cache";
import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import {
  assembleWaterQualitySnapshot, buildLegacyWaterQualityHealth, getLatestWaterQualitySummary,
} from "../services/waterQualityService";
import { buildUnavailableRdpSnapshot, classifyRdpLocation, coalesce, errorCode, getClient, mapLimit, withDeadline } from "./csoSource.js";
import { CATCHMENT_READ_DEADLINE_MS, CATCHMENT_WINDOW_HOURS, readSetActivity } from "./csoCatchment.js";
import {
  assessHistory, CSO_HISTORY_DEADLINE_MS, describeEvent, getCsoEventDetail, historyWindow, providerLabel, readEventPages, summariseCoverage,
} from "./csoHistory.js";
import { RELATIONSHIP_SCOPES } from "./relationshipContract.js";
import { RdpError } from "./errors.js";

// RDP-sourced HPP upstream membership (#114, replacing the Sewage Map runtime `CSO_IDs` list for public map, status
// and history assembly). Membership is the approved, published River Tracer relationship set; current status and events
// come from one cached whole-set activity walk, never one request per outfall.
//
// This changes WHICH outfalls are shown, not how activity is assessed: `number_CSOs_per_km2`, its chart, the calibrated
// indicator thresholds and alerts keep reading the legacy Mongo summary in every mode.

// The reviewed relationship this consumer accepts. Every pin is explicit: a republished set with a different version,
// network release or catalogue is refused (MEMBERSHIP_PIN_MISMATCH), so a changed network or catalogue can never
// silently change the population. Accepting a new version is a reviewed code change.
export const HPP_MEMBERSHIP = Object.freeze({
  relationshipSet: "hpp-upstream-outfalls",
  version: "bb422e98d78ee1bc5923c9e1d73c4d41708d3a343c7b31e44133ceeaa934c8d2",
  approval: "approved",
  network: Object.freeze({ id: "orn-v2-gb", version: "838c7ed826b26ee16a11ba2b5be9dc4d286bca8cc0159c6f33d540bf04c0155c" }),
  catalogues: Object.freeze([Object.freeze({
    providerId: "severn-trent", sourceId: "storm-overflow-activity", version: "9962b46480831b1939812c7f40372b9e8596a67a137b4e266d369703077432f2",
  })]),
  // The primary HPP view. Candidate and catchment-only members are returned separately labelled.
  primaryScope: "confirmed",
  // The RDP #72 collection set whose members are this relationship's catchment scope (ADR-002 D3).
  activitySet: "hpp-catchment",
});

export const MEMBERSHIP_DEADLINE_MS = 15000;
export const MEMBERSHIP_CACHE_SECONDS = 6 * 3600;
// The 30-day history is not available from the set read (at most 7 days), so it reads per outfall, bounded. Outfalls with
// events in the last 7 days are read first; every outfall not read is reported, never treated as having no events.
export const MEMBERSHIP_30D_MAX_OUTFALLS = 40;
const SET_WINDOW_HOURS = { "24h": 24, "7d": 168 };
const READ_CONCURRENCY = 4;
const SOURCE_NAME = "river-data-platform-cso";
const RELATED_CATEGORIES = ["candidate", "catchment-only"];
const PLOTTED_STATES = ["active", "recent"];

// ---- Reading and pinning the relationship set (the RDP_CSO_MEMBERSHIP switch is in waterQualityService) ----

function verifyPins(set) {
  const pinned = HPP_MEMBERSHIP;
  const catalogues = set.catalogues.map(({ providerId, sourceId, version }) => `${providerId}:${sourceId}:${version}`).sort();
  const expected = pinned.catalogues.map(({ providerId, sourceId, version }) => `${providerId}:${sourceId}:${version}`).sort();
  if (set.version !== pinned.version || set.network.id !== pinned.network.id || set.network.version !== pinned.network.version ||
      catalogues.join("|") !== expected.join("|")) throw new RdpError("MEMBERSHIP_PIN_MISMATCH");
  if (set.review.approval !== pinned.approval) throw new RdpError("MEMBERSHIP_NOT_APPROVED");
  return set;
}

// Public IDs stay the provider-native ID (the existing `id`, map keys and `/cso?ids=` compatibility). If two providers'
// members ever share an external ID, both use the canonical asset ID instead: never a silent merge.
function withPublicIds(set) {
  const seen = new Map();
  for (const member of set.members) seen.set(member.externalId, (seen.get(member.externalId) ?? 0) + 1);
  return { ...set, members: set.members.map((member) => ({ ...member, id: seen.get(member.externalId) > 1 ? member.assetId : member.externalId })) };
}

async function readMembershipUncached() {
  return withPublicIds(verifyPins(await getClient().getRiverRelationships(HPP_MEMBERSHIP.relationshipSet)));
}

// The pinned version is part of the key, so a pin change never serves the previous set. Only verified sets are cached;
// a failed or mismatched read throws and is never cached (Next keeps serving the last good entry while revalidating).
const readCachedMembership = unstable_cache(readMembershipUncached, ["rdp-hpp-membership-v1", HPP_MEMBERSHIP.version],
  { revalidate: MEMBERSHIP_CACHE_SECONDS, tags: ["rdp-cso", "rdp-river"] });

export const readHppMembership = () => coalesce("hpp-membership", () => readCachedMembership().then(verifyPins));

export function describeMembership(set) {
  const scope = (name) => ({ name, count: set.scopes[name].count, distinctLocations: set.scopes[name].distinctLocations });
  return {
    source: "rdp",
    state: "available",
    relationshipSet: set.setId,
    version: set.version,
    approval: set.review.approval,
    approvedAt: set.review.approvedAt,
    policy: set.review.policy,
    network: set.network,
    catalogues: set.catalogues.map(({ providerId, sourceId, version, attribution, licence }) =>
      ({ providerId, providerLabel: providerLabel(providerId), sourceId, version, attribution, licence })),
    primaryScope: HPP_MEMBERSHIP.primaryScope,
    scopes: Object.keys(RELATIONSHIP_SCOPES).map(scope),
    // Not members of any scope; counted so "unknown" relationships stay distinct from confirmed ones.
    notUpstream: { ambiguous: set.categories.ambiguous, unlocatable: set.categories.unlocatable, excluded: set.categories.excluded },
    activitySet: HPP_MEMBERSHIP.activitySet,
  };
}

function membershipFailure(error) {
  return { source: "rdp", state: "unavailable", relationshipSet: HPP_MEMBERSHIP.relationshipSet, pinnedVersion: HPP_MEMBERSHIP.version,
    errorCode: errorCode(error) };
}

const coordinates = (member) => (Number.isFinite(member.longitude) && Number.isFinite(member.latitude) ? { x: member.longitude, y: member.latitude } : null);
const relationshipOf = (member) => ({ category: member.category, reason: member.reason, reviewed: member.reviewed, routed: member.routed });

// ---- Current status over the membership (public map and counts) ----

// Each member classified by the page's existing current/recent rules from the whole-set walk. A member the walk did not
// return is `unknown`: `status_not_read` when the walk stopped early, `not_monitored` when RDP's set does not include it.
export function classifyMembers(members, walk, now) {
  const items = new Map(walk.items.map((item) => [item.status.assetId, item]));
  return members.map((member) => {
    const item = items.get(member.assetId);
    const asset = { longitude: member.longitude, latitude: member.latitude, receivingWatercourse: member.receivingWatercourse };
    const location = classifyRdpLocation(member.id, { identity: { state: "mapped", assetId: member.assetId, asset },
      status: item?.status, events: item?.events ?? null }, { now });
    const statusReason = item ? location.statusReason : walk.complete ? "not_monitored" : "status_not_read";
    return { ...location, statusReason, assetId: member.assetId, externalId: member.externalId, provider: member.providerId,
      sourceId: member.sourceId, relationship: relationshipOf(member) };
  });
}

const tally = (rows) => ({
  members: rows.length,
  currentlySpilling: rows.filter((row) => row.status === "active").length,
  recentlyStopped48h: rows.filter((row) => row.status === "recent").length,
  offline: rows.filter((row) => row.status === "offline").length,
  unknown: rows.filter((row) => row.status === "unknown").length,
});

function walkSummary(walk, members) {
  const memberIds = new Set(members.map((member) => member.assetId));
  return { set: walk.set, hours: walk.hours, complete: walk.complete, total: walk.total, received: walk.received, missing: walk.missing,
    partialPages: walk.partialPages, stopReason: walk.stopReason, errorCode: walk.errorCode, retrievedAt: walk.retrievedAt,
    outsideMembership: walk.items.filter((item) => !memberIds.has(item.status.assetId)).length };
}

function assertWalkSource(walk, set) {
  if (!set.catalogues.some((entry) => entry.providerId === walk.provider && entry.sourceId === walk.sourceId)) {
    throw new RdpError("RESPONSE_CONTRACT_ERROR");
  }
}

// RDP_CSO_SOURCE=rdp with RDP_CSO_MEMBERSHIP=rdp. Never reads Mongo `csoData` or `CSO_IDs`; the Mongo summary still
// supplies the density fields and their freshness, which this task does not change.
export async function getRdpMembershipWaterQualitySnapshot(now = new Date()) {
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso-membership");
  const latest = await getLatestWaterQualitySummary();
  if (!latest) return null;

  let set;
  try {
    set = await withDeadline(readHppMembership(), MEMBERSHIP_DEADLINE_MS);
  } catch (error) {
    // Membership unknown: no member list, no counts, and no fallback to the Sewage Map list.
    logger.warn(`RDP HPP membership unavailable ${JSON.stringify({ code: errorCode(error) })}`);
    const membership = membershipFailure(error);
    const snapshot = buildUnavailableRdpSnapshot(latest, now, membership.errorCode, { members: [], membership });
    return { ...snapshot, WaterQuality: { ...snapshot.WaterQuality, CSOIds: null }, statusSummary: { ...snapshot.statusSummary, unknown: null } };
  }

  const membership = describeMembership(set);
  const primary = set.members.filter((member) => member.category === HPP_MEMBERSHIP.primaryScope);
  let walk;
  try {
    walk = await withDeadline(readSetActivity(HPP_MEMBERSHIP.activitySet, CATCHMENT_WINDOW_HOURS), CATCHMENT_READ_DEADLINE_MS);
    assertWalkSource(walk, set);
  } catch (error) {
    logger.warn(`RDP CSO set activity unavailable; reporting status unavailable ${JSON.stringify({ code: errorCode(error) })}`);
    return buildUnavailableRdpSnapshot(latest, now, errorCode(error), {
      members: primary.map((member) => ({ id: member.id, assetId: member.assetId, externalId: member.externalId, provider: member.providerId,
        sourceId: member.sourceId, relationship: relationshipOf(member), coordinates: null, receivingWaterCourse: member.receivingWatercourse })),
      membership,
    });
  }

  const rows = classifyMembers(set.members, walk, now);
  const locations = rows.filter((row) => row.relationship.category === HPP_MEMBERSHIP.primaryScope);
  const related = rows.filter((row) => RELATED_CATEGORIES.includes(row.relationship.category));
  const read = walkSummary(walk, set.members);
  const partial = !walk.complete || walk.partialPages > 0;
  if (partial) logger.warn(`RDP CSO set activity degraded ${JSON.stringify(read)}`);
  const health = { ...buildLegacyWaterQualityHealth(latest, now), source: SOURCE_NAME,
    cso: { origin: "rdp", available: true, partial, unknown: locations.filter((row) => row.status === "unknown").length, read } };
  const snapshot = assembleWaterQualitySnapshot(latest, locations, now, health, { csoIds: locations.map((row) => row.id), membership });
  return {
    ...snapshot,
    // Possibly-upstream members, separately labelled and never in the primary counts. Only plotted states are listed
    // (the payload stays small); every member is in the per-category counts.
    relatedLocations: {
      categories: Object.fromEntries(RELATED_CATEGORIES.map((category) => [category, tally(related.filter((row) => row.relationship.category === category))])),
      locations: related.filter((row) => PLOTTED_STATES.includes(row.status)),
    },
  };
}

// ---- Recorded event history over the membership ----

function memberSummary(member) {
  return {
    id: member.id,
    assetId: member.assetId,
    externalId: member.externalId,
    provider: member.providerId,
    providerLabel: providerLabel(member.providerId),
    sourceId: member.sourceId,
    name: null,
    receivingWatercourse: member.receivingWatercourse,
    coordinates: coordinates(member),
    relationship: relationshipOf(member),
  };
}

const newestFirst = (a, b) => (a.startedAt === b.startedAt ? (a.eventId < b.eventId ? -1 : 1) : a.startedAt < b.startedAt ? 1 : -1);

function sourcesFor(set, outfalls) {
  const read = new Set(outfalls.filter((outfall) => outfall.state === "read").map((outfall) => `${outfall.provider}:${outfall.sourceId}`));
  return set.catalogues.filter((entry) => read.has(`${entry.providerId}:${entry.sourceId}`))
    .map((entry) => ({ provider: entry.providerId, providerLabel: providerLabel(entry.providerId), sourceId: entry.sourceId, attribution: entry.attribution }));
}

// 24 h and 7 d: one whole-set walk at that window (shared cache with other readers of the same window).
function historyFromWalk(members, walk) {
  const items = new Map(walk.items.map((item) => [item.status.assetId, item]));
  const events = [];
  const outfalls = members.map((member) => {
    const summary = memberSummary(member);
    const item = items.get(member.assetId);
    if (!item) return { ...summary, state: walk.complete ? "not_monitored" : "not_read" };
    if (!item.events) return { ...summary, state: "failed", errorCode: "EVENTS_UNAVAILABLE" };
    const page = walk.pages[item.page];
    events.push(...item.events.events.map((event) => ({ ...describeEvent(event, { from: walk.from, asOf: page.retrievedAt }),
      outfallId: member.id, assetId: member.assetId, asOf: page.retrievedAt })));
    return { ...summary, state: "read", truncated: item.events.truncated, coverage: summariseCoverage(item.events.coverage, walk.from, page.to, page.retrievedAt),
      eventCount: item.events.events.length };
  });
  return { outfalls, events };
}

// 30 d: per-outfall reads, bounded. Priority is the 7-day walk's most recent event, then the stable member order.
async function historyFromOutfallReads(members, window, logger) {
  let priority = new Map();
  let prioritisedBy = "member_order";
  try {
    const recent = await withDeadline(readSetActivity(HPP_MEMBERSHIP.activitySet, 168), CATCHMENT_READ_DEADLINE_MS);
    priority = new Map(recent.items.filter((item) => item.events?.events.length)
      .map((item) => [item.status.assetId, item.events.events.map((event) => event.startedAt).sort().at(-1)]));
    prioritisedBy = "events_last_7d";
  } catch (error) {
    logger.warn(`RDP CSO 7-day set read unavailable for 30-day priority ${JSON.stringify({ code: errorCode(error) })}`);
  }
  const ordered = [...members].sort((a, b) => (priority.get(b.assetId) ?? "").localeCompare(priority.get(a.assetId) ?? "") || a.assetId.localeCompare(b.assetId));
  const outfalls = members.map((member) => ({ ...memberSummary(member), state: "pending" }));
  const byAsset = new Map(outfalls.map((outfall) => [outfall.assetId, outfall]));
  const targets = ordered.slice(0, MEMBERSHIP_30D_MAX_OUTFALLS).map((member) => byAsset.get(member.assetId));
  ordered.slice(MEMBERSHIP_30D_MAX_OUTFALLS).forEach((member) => Object.assign(byAsset.get(member.assetId), { state: "not_read", notReadReason: "read_limit" }));

  const events = [];
  let timedOut = false;
  const reads = mapLimit(targets, READ_CONCURRENCY, async (outfall) => {
    try {
      const result = await readEventPages(outfall.assetId, window.from, window.to);
      if (timedOut) return;
      Object.assign(outfall, { state: "read", truncated: result.truncated, pageIntegrity: "verified",
        coverage: summariseCoverage(result.coverage, window.from, window.to, result.requestAsOf), eventCount: result.events.length });
      events.push(...result.events.map((event) => ({ ...describeEvent(event, { from: window.from, asOf: result.requestAsOf }),
        outfallId: outfall.id, assetId: outfall.assetId, asOf: result.requestAsOf })));
    } catch (error) {
      if (!timedOut) Object.assign(outfall, { state: "failed", errorCode: errorCode(error) });
    }
  });
  try {
    await withDeadline(reads, CSO_HISTORY_DEADLINE_MS);
  } catch {
    timedOut = true;
    targets.forEach((outfall) => { if (outfall.state === "pending") Object.assign(outfall, { state: "failed", errorCode: "TIMEOUT" }); });
  }
  return { outfalls, events, readPolicy: { limit: MEMBERSHIP_30D_MAX_OUTFALLS, prioritisedBy } };
}

// Never rejects for an RDP failure: the section reports `unavailable` and the rest of the page is untouched.
export async function getMembershipEventHistory(windowKey = "24h", now = new Date()) {
  const window = historyWindow(windowKey, now);
  const logger = createRequestLogger({ method: "GET" }, "rdp/cso-membership-history");
  const base = { window, retrievedAt: now.toISOString() };
  const empty = (membership, code) => ({ ...base, state: "unavailable", errorCode: code, membership, outfalls: [], events: [],
    evidence: assessHistory({ outfalls: [], events: [], window }) });

  let set;
  try {
    set = await withDeadline(readHppMembership(), MEMBERSHIP_DEADLINE_MS);
  } catch (error) {
    logger.warn(`RDP HPP membership unavailable for history ${JSON.stringify({ code: errorCode(error) })}`);
    return empty(membershipFailure(error), errorCode(error));
  }
  const membership = describeMembership(set);
  const members = set.members.filter((member) => member.category === HPP_MEMBERSHIP.primaryScope);

  let result;
  let shownWindow = window;
  const hours = SET_WINDOW_HOURS[windowKey];
  if (hours) {
    let walk;
    try {
      walk = await withDeadline(readSetActivity(HPP_MEMBERSHIP.activitySet, hours), CATCHMENT_READ_DEADLINE_MS);
      assertWalkSource(walk, set);
    } catch (error) {
      logger.warn(`RDP CSO set history unavailable ${JSON.stringify({ window: windowKey, code: errorCode(error) })}`);
      return empty(membership, errorCode(error));
    }
    // The set read's own window (RDP's `from`/`to`), which may lag the bucketed window by the cache age.
    shownWindow = { key: window.key, hours: window.hours, from: walk.from, to: walk.to };
    result = { ...historyFromWalk(members, walk), readPolicy: { source: "set_activity", set: walk.set, complete: walk.complete } };
  } else {
    result = await historyFromOutfallReads(members, window, logger);
  }

  const failed = result.outfalls.filter((outfall) => outfall.state === "failed");
  if (failed.length) logger.warn(`RDP CSO membership history degraded ${JSON.stringify({ window: windowKey, failed: failed.length })}`);
  result.events.sort(newestFirst);
  const evidence = assessHistory({ outfalls: result.outfalls, events: result.events, window: shownWindow });
  return { ...base, window: shownWindow, state: evidence.conclusion === "unavailable" ? "unavailable" : "available", membership,
    readPolicy: result.readPolicy, outfalls: result.outfalls, events: result.events, evidence, sources: sourcesFor(set, result.outfalls) };
}

// One event, restricted to the confirmed membership (the route is still not a general RDP proxy).
export async function getMembershipEventDetail(eventId) {
  return getCsoEventDetail(eventId, {
    resolveMember: async (assetId, catalogue) => {
      let set;
      try {
        set = await withDeadline(readHppMembership(), MEMBERSHIP_DEADLINE_MS);
      } catch {
        throw new HttpError(503, "Event history temporarily unavailable");
      }
      const member = set.members.find((entry) => entry.assetId === assetId && entry.category === HPP_MEMBERSHIP.primaryScope);
      if (!member) return null;
      const name = catalogue.assets.find((asset) => asset.assetId === assetId)?.name ?? null;
      return { ...memberSummary(member), name };
    },
  });
}
