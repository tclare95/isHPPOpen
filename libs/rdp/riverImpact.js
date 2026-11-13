import "server-only";
import { RdpError } from "./errors.js";

// RDP live status-aware downstream impact (`GET /v1/river/impact/{set}`, schema rdp.river-tracer.impact/v1).
// Connectivity only: reaches potentially downstream of reported discharges. Never a pollution, travel-time or safety
// claim, and never an input to the indicator, thresholds or alerts.
export const RIVER_IMPACT_SCHEMA = "rdp.river-tracer.impact/v1";
export const RIVER_IMPACT_WINDOWS = Object.freeze([24, 48, 168]);
// RDP caps the gzipped body at 4 MB; the decoded GeoJSON is larger. Counted before parsing, like every river read.
export const RIVER_IMPACT_MAX_BYTES = 12 * 1024 * 1024;
export const RIVER_IMPACT_MAX_FEATURES = 60000;
export const DRAWN_STATES = Object.freeze(["active", "unresolved", "recent"]);
export const IMPACT_STATES = Object.freeze([...DRAWN_STATES, "unknown", "no-reported-discharge"]);
const LIFECYCLES = ["ongoing", "completed", "unresolved"];
const RECONCILIATIONS = ["resolved", "held"];

const ASSET = /^[a-z0-9][a-z0-9-]{0,79}:[a-z0-9][a-z0-9-]{0,79}:[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SET_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const text = (value) => typeof value === "string" && value.length > 0 && value.length <= 8000;
const optionalText = (value) => value === null || value === undefined || text(value);
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
const optionalTimestamp = (value) => value === null || value === undefined || timestamp(value);
const count = (value) => Number.isInteger(value) && value >= 0;
const strings = (value) => Array.isArray(value) && value.length <= 1000 && value.every(text);
const assets = (value) => Array.isArray(value) && value.length <= 5000 && value.every((id) => typeof id === "string" && ASSET.test(id));
const position = (value) => Array.isArray(value) && value.length === 2 &&
  Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;

function check(condition) {
  if (!condition) throw new RdpError("RESPONSE_CONTRACT_ERROR");
}

export function assertRiverImpactQuery(set, hours) {
  if (typeof set !== "string" || !SET_ID.test(set) || !RIVER_IMPACT_WINDOWS.includes(hours)) throw new RdpError("INVALID_QUERY");
}

function event(value) {
  if (value === null) return null;
  check(value && text(value.eventId) && timestamp(value.startedAt) && optionalTimestamp(value.endedAt) &&
    optionalTimestamp(value.endNoLaterThan) && LIFECYCLES.includes(value.lifecycle) && RECONCILIATIONS.includes(value.reconciliation));
  return { eventId: value.eventId, startedAt: value.startedAt, endedAt: value.endedAt ?? null, endNoLaterThan: value.endNoLaterThan ?? null,
    lifecycle: value.lifecycle, reconciliation: value.reconciliation };
}

// Strict, then compact: only drawn outfalls and their reaches leave the server, with the evidence needed to explain them.
export function parseRiverImpact(payload, set, hours) {
  const meta = payload?.riverTracer;
  check(payload?.type === "FeatureCollection" && Array.isArray(payload.features) && payload.features.length <= RIVER_IMPACT_MAX_FEATURES &&
    meta?.schema === RIVER_IMPACT_SCHEMA && meta.kind === "status-aware-downstream-impact" && timestamp(meta.asOf) && meta.windowHours === hours);
  const relationships = meta.relationships;
  check(relationships?.setId === set && digest(relationships.version) && text(relationships.approval) && text(relationships.scope));
  check(meta.network && text(meta.network.id) && digest(meta.network.version) && text(meta.network.dataset) && text(meta.network.release));
  check(text(meta.attribution) && text(meta.licence) && strings(meta.caveats) && assets(meta.unroutedDrawnOutfalls) &&
    meta.counts && IMPACT_STATES.every((state) => count(meta.counts[state])) && meta.routes && typeof meta.routes === "object" &&
    meta.statusInput && typeof meta.statusInput.partial === "boolean");
  const publication = meta.publication ?? null;
  if (publication) check(Number.isInteger(publication.refreshSeconds) && publication.refreshSeconds > 0 && timestamp(publication.bucketEnd));

  const outfalls = [];
  const drawn = new Set();
  const reaches = [];
  for (const feature of payload.features) {
    check(feature?.type === "Feature" && feature.properties && typeof feature.properties === "object");
    const p = feature.properties;
    if (p.kind === "outfall") {
      check(feature.geometry?.type === "Point" && position(feature.geometry.coordinates) && typeof p.assetId === "string" &&
        ASSET.test(p.assetId) && IMPACT_STATES.includes(p.impact) && typeof p.routed === "boolean" && strings(p.reasons) &&
        text(p.relationship) && optionalTimestamp(p.statusFetchedAt) && optionalTimestamp(p.statusStart));
      const latestEvent = event(p.latestEvent ?? null);
      if (!DRAWN_STATES.includes(p.impact)) continue;
      check(!drawn.has(p.assetId));
      drawn.add(p.assetId);
      const route = meta.routes[p.assetId] ?? null;
      if (route) check(["complete", "incomplete"].includes(route.completeness) && text(route.termination) && count(route.reachCount) &&
        Number.isFinite(route.lengthM) && route.lengthM >= 0 && strings(route.reasons));
      check(p.routed === Boolean(route));
      outfalls.push({
        assetId: p.assetId, externalId: p.assetId.split(":")[2], impact: p.impact, current: p.current ?? null, recent: p.recent ?? null,
        relationship: p.relationship, coordinates: feature.geometry.coordinates, routed: p.routed, reasons: p.reasons, latestEvent,
        statusFetchedAt: p.statusFetchedAt ?? null, statusStart: p.statusStart ?? null,
        route: route ? { completeness: route.completeness, termination: route.termination, reachCount: route.reachCount, lengthM: route.lengthM } : null,
      });
    } else if (p.kind === "impact-reach") {
      check(feature.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2 &&
        feature.geometry.coordinates.length <= 20000 && feature.geometry.coordinates.every(position) && text(p.reachId) &&
        DRAWN_STATES.includes(p.impact) && optionalText(p.name) && DRAWN_STATES.every((state) => assets(p[`${state}Contributors`])));
      reaches.push(feature);
    } else check(false);
  }
  // Every reach is explained by the drawn outfalls it lists, under its precedence (active > unresolved > recent).
  const byId = new Map(outfalls.map((outfall) => [outfall.assetId, outfall]));
  const reachFeatures = reaches.map(({ geometry, properties: p }) => {
    const contributors = Object.fromEntries(DRAWN_STATES.map((state) => [state, p[`${state}Contributors`]]));
    check(DRAWN_STATES.every((state) => contributors[state].every((id) => byId.get(id)?.impact === state)) &&
      p.impact === DRAWN_STATES.find((state) => contributors[state].length > 0));
    return { type: "Feature", geometry, properties: { reachId: p.reachId, impact: p.impact, name: p.name ?? null, contributors } };
  });
  return {
    asOf: meta.asOf,
    windowHours: meta.windowHours,
    relationships: { setId: relationships.setId, version: relationships.version, approval: relationships.approval, scope: relationships.scope },
    network: { id: meta.network.id, version: meta.network.version, dataset: meta.network.dataset, release: meta.network.release },
    statusPartial: meta.statusInput.partial,
    publication: publication ? { refreshSeconds: publication.refreshSeconds, bucketEnd: publication.bucketEnd } : null,
    counts: Object.fromEntries(IMPACT_STATES.map((state) => [state, meta.counts[state]])),
    unroutedDrawnOutfalls: meta.unroutedDrawnOutfalls,
    attribution: meta.attribution,
    licence: meta.licence,
    caveats: meta.caveats,
    outfalls,
    reaches: { type: "FeatureCollection", features: reachFeatures },
  };
}
