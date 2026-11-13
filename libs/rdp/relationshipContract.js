import "server-only";
import { RdpError } from "./errors.js";
import { CSO_ASSET_ID } from "./csoContract.js";

// Strict validation of a published River Tracer upstream-outfall relationship set
// (`GET /v1/river/relationships/{set}`, RDP ADR-002 D5, schema `rdp.river-tracer.upstream-relationships/v1`).
// RDP verifies the set's content digest before serving it. Here the consumer re-checks everything it can without
// RDP's canonical serialiser: identities, categories, membership and every scope count must agree with each other.
// Anything else is RESPONSE_CONTRACT_ERROR: a set that does not add up is never partly used.

export const RELATIONSHIP_SCHEMA = "rdp.river-tracer.upstream-relationships/v1";
export const RELATIONSHIP_MAX_ASSETS = 10000;
const DIGEST = /^[a-f0-9]{64}$/;
const SET_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

// Listed categories. `excluded` is listed only for a reviewed exclusion; automatic exclusions are counted, not listed.
export const RELATIONSHIP_CATEGORIES = ["confirmed", "candidate", "catchment-only", "ambiguous", "excluded", "unlocatable"];
// The nested scopes RDP publishes. Only these three categories are ever upstream members of any scope.
export const RELATIONSHIP_SCOPES = Object.freeze({
  confirmed: Object.freeze(["confirmed"]),
  network: Object.freeze(["confirmed", "candidate"]),
  catchment: Object.freeze(["confirmed", "candidate", "catchment-only"]),
});
export const SCOPE_CATEGORIES = RELATIONSHIP_SCOPES.catchment;
const APPROVALS = ["unreviewed", "proposed", "approved"];

function check(condition) {
  if (!condition) throw new RdpError("RESPONSE_CONTRACT_ERROR");
}
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 500) => typeof value === "string" && value.length > 0 && value.length <= max;
const optionalText = (value, max = 2000) => value === null || value === undefined || text(value, max);
const count = (value) => Number.isInteger(value) && value >= 0;
const coordinate = (value, limit) => value === null || value === undefined || (Number.isFinite(value) && Math.abs(value) <= limit);

export function assertRelationshipSetId(value) {
  if (typeof value !== "string" || !SET_ID.test(value)) throw new RdpError("INVALID_QUERY");
  return value;
}

function parseCatalogue(entry) {
  check(object(entry) && text(entry.providerId, 80) && text(entry.sourceId, 80) && typeof entry.version === "string" &&
    DIGEST.test(entry.version) && count(entry.assets) && optionalText(entry.attribution, 500) && optionalText(entry.licence, 500));
  return { providerId: entry.providerId, sourceId: entry.sourceId, version: entry.version, assets: entry.assets,
    attribution: entry.attribution ?? null, licence: entry.licence ?? null };
}

function parseRelationship(row, sources) {
  check(object(row) && text(row.assetId, 200) && CSO_ASSET_ID.test(row.assetId) && text(row.providerId, 80) && text(row.externalId, 64) &&
    // A reviewed decision's reason is free text (e.g. SVT01157); an automatic one is a reason code.
    RELATIONSHIP_CATEGORIES.includes(row.category) && text(row.reason, 2000) && optionalText(row.evidence, 120) && optionalText(row.basis, 120) &&
    optionalText(row.receivingWatercourse) && coordinate(row.longitude, 180) && coordinate(row.latitude, 90) &&
    (row.route === undefined || row.route === null || (object(row.route) && text(row.route.path, 500))));
  // The canonical identity is exactly provider:source:externalId of one pinned catalogue.
  const sourceId = sources.get(row.providerId);
  check(sourceId !== undefined && row.assetId === `${row.providerId}:${sourceId}:${row.externalId}`);
  return {
    assetId: row.assetId,
    providerId: row.providerId,
    sourceId,
    externalId: row.externalId,
    category: row.category,
    reason: row.reason,
    reviewed: row.basis === "review",
    longitude: row.longitude ?? null,
    latitude: row.latitude ?? null,
    receivingWatercourse: row.receivingWatercourse ?? null,
    routed: Boolean(row.route),
  };
}

// Returns a compact, internally consistent form: set identity, pins, review state, scope counts and the upstream
// members (confirmed, candidate and catchment-only) with their category. Ambiguous, excluded and unlocatable assets
// are counted, never returned as members.
export function parseRelationshipSet(payload, setId) {
  check(object(payload) && payload.schema === RELATIONSHIP_SCHEMA && payload.setId === setId &&
    typeof payload.version === "string" && DIGEST.test(payload.version));
  const { network, review, membership, coverage, location } = payload;
  check(object(network) && text(network.id, 80) && typeof network.version === "string" && DIGEST.test(network.version));
  check(object(review) && APPROVALS.includes(review.approval) && optionalText(review.policy, 120) &&
    (review.approval !== "approved" || (text(review.approvedBy, 2000) && text(review.approvedAt, 40))));
  check(object(location) && optionalText(location.name, 200) && coordinate(location.longitude, 180) && coordinate(location.latitude, 90));
  check(Array.isArray(payload.catalogues) && payload.catalogues.length >= 1 && payload.catalogues.length <= 20);
  const catalogues = payload.catalogues.map(parseCatalogue);
  const sources = new Map(catalogues.map((entry) => [entry.providerId, entry.sourceId]));
  // One catalogue per provider: otherwise an identity could not be attributed to exactly one pinned version.
  check(sources.size === catalogues.length);

  check(Array.isArray(payload.relationships) && payload.relationships.length <= RELATIONSHIP_MAX_ASSETS);
  const relationships = payload.relationships.map((row) => parseRelationship(row, sources));
  check(new Set(relationships.map((row) => row.assetId)).size === relationships.length);
  const byCategory = Object.fromEntries(RELATIONSHIP_CATEGORIES.map((category) => [category, 0]));
  for (const row of relationships) byCategory[row.category] += 1;

  // Membership is the confirmed scope, exactly.
  check(object(membership) && membership.basis === "confirmed" && membership.approval === review.approval &&
    Array.isArray(membership.assetIds) && membership.count === membership.assetIds.length &&
    membership.assetIds.every((id) => typeof id === "string" && CSO_ASSET_ID.test(id)));
  const confirmed = new Set(relationships.filter((row) => row.category === "confirmed").map((row) => row.assetId));
  check(new Set(membership.assetIds).size === membership.count && membership.count === confirmed.size &&
    membership.assetIds.every((id) => confirmed.has(id)));

  // Every published scope has the documented categories and a count that matches the listed relationships.
  check(Array.isArray(payload.scopes) && payload.scopes.length === Object.keys(RELATIONSHIP_SCOPES).length);
  const scopes = {};
  for (const scope of payload.scopes) {
    check(object(scope) && Object.hasOwn(RELATIONSHIP_SCOPES, scope.name) && !scopes[scope.name] && Array.isArray(scope.categories) &&
      scope.categories.length === RELATIONSHIP_SCOPES[scope.name].length &&
      RELATIONSHIP_SCOPES[scope.name].every((category) => scope.categories.includes(category)) &&
      count(scope.count) && (scope.distinctLocations === undefined || count(scope.distinctLocations)));
    check(scope.count === RELATIONSHIP_SCOPES[scope.name].reduce((sum, category) => sum + byCategory[category], 0));
    scopes[scope.name] = { count: scope.count, distinctLocations: scope.distinctLocations ?? null };
  }

  // The coverage denominator agrees with the listed upstream categories (automatic exclusions are only counted).
  check(object(coverage) && object(coverage.categories) && count(coverage.catalogueAssets));
  const categories = {};
  for (const category of RELATIONSHIP_CATEGORIES) {
    const value = coverage.categories[category] ?? 0;
    check(count(value) && (category === "excluded" ? value >= byCategory.excluded : value === byCategory[category]));
    categories[category] = value;
  }
  check(Object.values(categories).reduce((a, b) => a + b, 0) === coverage.catalogueAssets);

  return {
    schema: payload.schema,
    setId: payload.setId,
    version: payload.version,
    location: { name: location.name ?? null, longitude: location.longitude ?? null, latitude: location.latitude ?? null },
    network: { id: network.id, version: network.version },
    catalogues,
    review: { approval: review.approval, approvedAt: review.approvedAt ?? null, policy: review.policy ?? null },
    scopes,
    categories,
    members: relationships.filter((row) => SCOPE_CATEGORIES.includes(row.category)),
  };
}
