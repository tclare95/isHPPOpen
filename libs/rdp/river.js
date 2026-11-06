import "server-only";
import { RdpError } from "./errors.js";

export const RIVER_MAX_BYTES = 3 * 1024 * 1024;
const digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = (value) => typeof value === "string" && /^\d{1,12}$/.test(value);
const text = (value) => typeof value === "string" && value.length > 0 && value.length <= 8000;
const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const strings = (value) => Array.isArray(value) && value.every(text);
const position = (value) => Array.isArray(value) && value.length === 2 &&
  Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
function check(condition) {
  if (!condition) throw new RdpError("RESPONSE_CONTRACT_ERROR");
}
function match(value) {
  check(value && ["Matched", "Ambiguous", "NoMatch", "OutOfCoverage"].includes(value.status) && text(value.reason) &&
    Array.isArray(value.candidates) && value.candidates.length <= 100 && value.candidates.every((candidate) =>
      candidate && id(candidate.reachId) && nonnegative(candidate.distanceM) && (candidate.name === null || text(candidate.name))));
  if (value.status === "Matched") check(id(value.reachId));
}

// Count decoded bytes, including chunked/gzipped HTTP bodies, before JSON parsing.
export async function readRiverJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new RdpError("RESPONSE_CONTRACT_ERROR");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RIVER_MAX_BYTES) throw new RdpError("RESULT_TOO_LARGE", 413);
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function riverCoordinates(point) {
  if (!position([point?.longitude, point?.latitude])) throw new RdpError("INVALID_QUERY");
  return { lon: String(point.longitude), lat: String(point.latitude) };
}

export function parseRiverLocation(payload) {
  const value = payload?.data;
  check(value && digest(value.release?.version) && value.release.token === value.release.version.slice(0, 16) &&
    text(value.release.releaseId));
  match(value.match);
  if (value.match.status === "Matched" && value.sample) {
    check(id(value.basinId) && id(value.sample.sampleId) && position(value.sample.position) &&
      nonnegative(value.sample.snapOffsetM) && typeof value.sample.hasCatchment === "boolean");
  } else check(value.sample === null && value.links === null);
  // Never follow producer-supplied links: construct only release-scoped river paths below.
  const { match: confidence, release, basinId, sample, snapReason } = value;
  return { match: confidence, release, basinId, sample, snapReason };
}

export function riverSamplePath(location, direction, geometry) {
  if (!["upstream", "downstream"].includes(direction) || !["reaches", "none"].includes(geometry) ||
      location?.match?.status !== "Matched" || !digest(location.release?.version) ||
      !id(location.basinId) || !id(location.sample?.sampleId)) throw new RdpError("INVALID_QUERY");
  return `/v1/river/releases/${location.release.version.slice(0, 16)}/basins/${location.basinId}/samples/${location.sample.sampleId}/${direction}`;
}

function geometryValid(geometry) {
  const line = (value) => Array.isArray(value) && value.length >= 2 && value.every(position);
  const ring = (value) => line(value) && value.length >= 4 && value[0].every((v, i) => v === value.at(-1)[i]);
  const polygon = (value) => Array.isArray(value) && value.length > 0 && value.every(ring);
  const coordinates = geometry?.coordinates;
  switch (geometry?.type) {
    case "Point": return position(coordinates);
    case "LineString": return line(coordinates);
    case "Polygon": return polygon(coordinates);
    case "MultiPolygon": return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(polygon);
    default: return false;
  }
}

export function parseRiverTrace(payload, location, direction, geometry = "reaches") {
  const meta = payload?.riverTracer;
  check(payload?.type === "FeatureCollection" && Array.isArray(payload.features) && meta?.schema === "rdp.river-tracer.route/v1" &&
    meta.kind === `point-${direction}` && meta.releaseVersion === location.release.version);
  match(meta.match);
  check(meta.match.status === "Matched" && meta.match.reachId === location.match.reachId &&
    meta.canonicalSample?.sampleId === location.sample.sampleId && meta.canonicalSample.reachId === location.match.reachId &&
    meta.network?.networkId === `orn-v2-gb-basin-${location.basinId}` && digest(meta.network.version) &&
    digest(meta.network.archiveSha256) && text(meta.network.dataset) && text(meta.network.release) &&
    text(meta.attribution) && text(meta.licence) && strings(meta.caveats));
  const route = meta.route;
  check(route?.status === "traced" && route.direction === direction && route.startReachId === location.match.reachId &&
    ["complete", "incomplete"].includes(route.completeness) && text(route.termination) && strings(route.reasons) &&
    ["single", "branched"].includes(route.paths) && Number.isInteger(route.reachCount) && route.reachCount > 0 && nonnegative(route.lengthM));
  const summary = meta.summary;
  const segments = (value) => Array.isArray(value) && value.every((segment) =>
    segment && (segment.name === null || text(segment.name)) && nonnegative(segment.lengthM) && Number.isInteger(segment.reaches) && segment.reaches > 0);
  if (direction === "downstream") check(text(summary?.text) && segments(summary.segments));
  else {
    check(text(summary?.mainStem) && segments(summary.mainStemSegments) && strings(summary.chains) &&
      Number.isInteger(summary.namedRiverCount) && summary.namedRiverCount >= 0 && Array.isArray(summary.namedRivers) &&
      summary.namedRivers.length <= 200 && summary.namedRiversReturned === summary.namedRivers.length &&
      summary.namedRiverCount >= summary.namedRivers.length && summary.namedRivers.every((river) => river && text(river.name) &&
        (river.flowsInto === null || text(river.flowsInto)) && nonnegative(river.lengthM) && nonnegative(river.upstreamLengthM) &&
        Number.isInteger(river.depth) && river.depth >= 0 && position(river.joinsAt)));
    const catchment = meta.catchment;
    check(catchment && ["published", "unavailable", "not-loaded"].includes(catchment.status));
    if (catchment.status === "published") check(id(catchment.sampleId) && nonnegative(catchment.areaKm2) &&
      nonnegative(catchment.pourPointOffsetM) && text(catchment.selection) && text(catchment.note));
    else check(text(catchment.reason));
  }
  check(meta.geometry === (geometry === "none" ? "omitted" : "reaches") && payload.features.length <= 50002 &&
    payload.features.every((feature) => feature?.type === "Feature" && feature.properties && geometryValid(feature.geometry)));
  const { schema, kind, releaseVersion, canonicalSample, network, match: confidence, route: evidence,
    summary: names, catchment, attribution, licence, licenceUrl, caveats } = meta;
  return { type: "FeatureCollection", features: geometry === "none" ? [] : payload.features,
    riverTracer: { schema, kind, releaseVersion, canonicalSample, network, match: confidence, route: evidence,
      summary: names, ...(catchment ? { catchment } : {}), attribution, licence, licenceUrl, caveats, geometry: meta.geometry } };
}
