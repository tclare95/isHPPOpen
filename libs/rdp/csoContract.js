import "server-only";
import { RdpError } from "./errors.js";

// Response validation for RDP's CSO reads (#72 PR 3, docs/openapi-cso.json). Anything outside the
// documented shape is RESPONSE_CONTRACT_ERROR: the consumer never guesses at a partial payload.

export const CSO_ASSET_ID = /^[a-z0-9][a-z0-9-]{0,79}:[a-z0-9][a-z0-9-]{0,79}:[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const EVENT_ID = /^cse_[0-9a-f]{24}$/;
const CURSOR = /^[A-Za-z0-9_-]{40,7000}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/;

const STATUS_VALUES = ["available", "no_observations", "unresolved", "unavailable"];
const REPORTED_STATES = ["spilling", "not_spilling", "offline", "unknown"];
const EFFECTIVE_STATES = ["spilling", "not_spilling", "unknown"];
const FRESHNESS = ["fresh", "stale", "unknown"];
const LIFECYCLES = ["ongoing", "completed", "unresolved"];
const SELECTION_STATES = ["selected", "unresolved", "unknown", "not_selected"];
const CATALOGUE_STATES = ["Healthy", "Stale", "NoVerifiedCatalogue", "unavailable"];

function check(condition) {
  if (!condition) throw new RdpError("RESPONSE_CONTRACT_ERROR");
}

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 500) => typeof value === "string" && value.length > 0 && value.length <= max;
const nullableText = (value) => value === null || value === undefined || text(value, 2000);
const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const cursor = (value) => value === null || (typeof value === "string" && CURSOR.test(value));

export function isCsoTimestamp(value) {
  return typeof value === "string" && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

// Normalised to the same ISO form Mongo `Date` values serialise to, so legacy and RDP compare as strings.
function time(value) {
  check(isCsoTimestamp(value));
  return new Date(value).toISOString();
}

function nullableTime(value) {
  if (value === null || value === undefined) return null;
  return time(value);
}

function coordinate(value, limit) {
  check(value === null || value === undefined || (Number.isFinite(value) && Math.abs(value) <= limit));
  return value ?? null;
}

export function assertCsoAssetId(id) {
  if (typeof id !== "string" || id.length > 200 || !CSO_ASSET_ID.test(id)) throw new RdpError("INVALID_QUERY");
  return id;
}

export function assertCsoCursor(value) {
  if (value !== undefined && (typeof value !== "string" || !CURSOR.test(value))) throw new RdpError("INVALID_QUERY");
}

function parseCoverage(value) {
  check(object(value) && ["partial", "unknown"].includes(value.status) && value.reportingCompleteness === "unverified" &&
    Array.isArray(value.gaps) && value.gaps.length <= 2000);
  return {
    status: value.status,
    collectedFrom: nullableTime(value.collectedFrom),
    collectedTo: nullableTime(value.collectedTo),
    reportingCompleteness: value.reportingCompleteness,
    gaps: value.gaps.map((gap) => {
      check(object(gap) && gap.reason === "not_collected");
      const from = time(gap.from);
      const to = time(gap.to);
      check(from < to);
      return { from, to, reason: gap.reason };
    }),
  };
}

export function parseCsoCatalogue(payload) {
  check(object(payload) && Array.isArray(payload.data) && payload.data.length <= 1000 && object(payload.meta) &&
    nonNegativeInteger(payload.meta.total) && payload.meta.impact === "none_implied" && Array.isArray(payload.meta.catalogues) &&
    cursor(payload.meta.nextCursor));
  const assets = payload.data.map((asset) => {
    check(object(asset) && text(asset.assetId, 200) && CSO_ASSET_ID.test(asset.assetId) && text(asset.provider, 80) &&
      text(asset.sourceId, 80) && text(asset.externalId, 64) &&
      asset.assetId === `${asset.provider}:${asset.sourceId}:${asset.externalId}` && typeof asset.selected === "boolean" &&
      Array.isArray(asset.sets) && asset.sets.every((set) => text(set, 80)) && text(asset.catalogueVersion, 200) &&
      nullableText(asset.receivingWatercourse) && nullableText(asset.name));
    return {
      assetId: asset.assetId,
      provider: asset.provider,
      sourceId: asset.sourceId,
      externalId: asset.externalId,
      latitude: coordinate(asset.latitude, 90),
      longitude: coordinate(asset.longitude, 180),
      receivingWatercourse: asset.receivingWatercourse ?? null,
      name: asset.name ?? null,
      selected: asset.selected,
      sets: [...asset.sets],
      catalogueVersion: asset.catalogueVersion,
    };
  });
  const catalogues = payload.meta.catalogues.map((entry) => {
    check(object(entry) && text(entry.provider, 80) && text(entry.sourceId, 80));
    return { provider: entry.provider, sourceId: entry.sourceId, state: typeof entry.state === "string" ? entry.state : null,
      version: typeof entry.version === "string" ? entry.version : null };
  });
  return { assets, total: payload.meta.total, catalogues, nextCursor: payload.meta.nextCursor, retrievedAt: time(payload.meta.retrievedAt) };
}

export function parseCsoStatus(payload, ids) {
  check(object(payload) && Array.isArray(payload.data) && object(payload.meta) && typeof payload.meta.partial === "boolean" &&
    payload.data.length === ids.length);
  const rows = payload.data.map((row, index) => {
    check(object(row) && row.assetId === ids[index] && STATUS_VALUES.includes(row.status) &&
      REPORTED_STATES.includes(row.reportedState) && EFFECTIVE_STATES.includes(row.effectiveState) &&
      FRESHNESS.includes(row.freshness) && (row.reasons === undefined || (Array.isArray(row.reasons) && row.reasons.every((reason) => text(reason, 200)))) &&
      (row.sourceAgeSeconds === undefined || row.sourceAgeSeconds === null || Number.isFinite(row.sourceAgeSeconds)) &&
      (row.errorCode === undefined || row.errorCode === null || text(row.errorCode, 80)));
    // A spilling effective state without a valid source time cannot be verified evidence.
    if (row.effectiveState !== "unknown") check(row.status === "available" && isCsoTimestamp(row.sourceUpdatedAt));
    return {
      assetId: row.assetId,
      status: row.status,
      reportedState: row.reportedState,
      effectiveState: row.effectiveState,
      freshness: row.freshness,
      statusStart: nullableTime(row.statusStart),
      sourceUpdatedAt: nullableTime(row.sourceUpdatedAt),
      sourceAgeSeconds: row.sourceAgeSeconds ?? null,
      fetchedAt: nullableTime(row.fetchedAt),
      lastSuccessfulPollAt: nullableTime(row.lastSuccessfulPollAt),
      reasons: row.reasons ? [...row.reasons] : [],
      errorCode: row.errorCode ?? null,
    };
  });
  return { rows, partial: payload.meta.partial, retrievedAt: time(payload.meta.retrievedAt) };
}

function parseEvent(event, id) {
  check(object(event) && EVENT_ID.test(event.eventId) && event.assetId === id && LIFECYCLES.includes(event.lifecycle) &&
    ["provider_reported", "end_not_reported"].includes(event.boundaryProvenance) && Number.isInteger(event.revision) &&
    event.revision >= 1 && ["resolved", "held"].includes(event.reconciliation) && nonNegativeInteger(event.heldClaims) &&
    ["hot", "archive"].includes(event.tier));
  const startedAt = time(event.startedAt);
  const endedAt = nullableTime(event.endedAt);
  const endNoLaterThan = nullableTime(event.endNoLaterThan);
  check(endedAt === null || endedAt >= startedAt);
  // An exact end exists only for a provider-reported completion; an ongoing event has none.
  if (event.lifecycle === "ongoing") check(endedAt === null);
  if (event.lifecycle === "completed" && event.boundaryProvenance === "provider_reported") check(endedAt !== null);
  if (event.boundaryProvenance === "end_not_reported") check(endedAt === null);
  return {
    eventId: event.eventId, startedAt, endedAt, endNoLaterThan, lifecycle: event.lifecycle,
    boundaryProvenance: event.boundaryProvenance, revision: event.revision, reconciliation: event.reconciliation,
    heldClaims: event.heldClaims, tier: event.tier,
  };
}

export function parseCsoEvents(payload, id) {
  check(object(payload) && Array.isArray(payload.data) && payload.data.length <= 500 && object(payload.meta) &&
    payload.meta.assetId === id && payload.meta.pageIntegrity === "verified" && nonNegativeInteger(payload.meta.archiveObjectsVerified) &&
    cursor(payload.meta.nextCursor));
  const events = payload.data.map((event) => parseEvent(event, id));
  check(new Set(events.map((event) => event.eventId)).size === events.length);
  return {
    events,
    coverage: parseCoverage(payload.meta.coverage),
    from: time(payload.meta.from),
    to: time(payload.meta.to),
    requestAsOf: time(payload.meta.requestAsOf),
    nextCursor: payload.meta.nextCursor,
  };
}

export function parseCsoHealth(payload, id) {
  check(object(payload) && object(payload.data) && object(payload.meta) && payload.data.assetId === id);
  const { selection, catalogue, collection, events } = payload.data;
  check(object(selection) && SELECTION_STATES.includes(selection.state) &&
    (selection.sets === undefined || (Array.isArray(selection.sets) && selection.sets.every((set) => text(set, 80)))) &&
    [true, false, null, undefined].includes(selection.inVerifiedCatalogue) &&
    object(catalogue) && CATALOGUE_STATES.includes(catalogue.state) && object(collection) && object(events));
  const archive = events.lastArchiveRun;
  check(archive === null || archive === undefined || (object(archive) && ["examined", "archived", "blocked"].every((key) =>
    archive[key] === undefined || nonNegativeInteger(archive[key]))));
  return {
    assetId: id,
    selection: { state: selection.state, sets: selection.sets ? [...selection.sets] : [], inVerifiedCatalogue: selection.inVerifiedCatalogue ?? null },
    catalogue: { state: catalogue.state },
    coverageLast24h: collection.coverageLast24h ? parseCoverage(collection.coverageLast24h) : null,
    lastArchiveRun: archive ? { examined: archive.examined ?? null, archived: archive.archived ?? null, blocked: archive.blocked ?? null,
      errorCode: typeof archive.errorCode === "string" ? archive.errorCode : null } : null,
    retrievedAt: time(payload.meta.retrievedAt),
  };
}
