import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient, AssumeRoleWithWebIdentityCommand } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";
import { Hash } from "@smithy/hash-node";
import { setTimeout as delay } from "node:timers/promises";
import { getRdpConfig } from "./config.js";
import { getCanonicalMeasurement } from "./measurements.js";
import { RdpError } from "./errors.js";
import { assertRelationshipSetId, parseRelationshipSet } from "./relationshipContract.js";
import { parseRiverLocation, parseRiverTrace, riverCoordinates, riverSamplePath, readRiverJson } from "./river.js";
import { assertRiverImpactQuery, parseRiverImpact, RIVER_IMPACT_MAX_BYTES } from "./riverImpact.js";
import {
  assertCsoAssetId, assertCsoCursor, assertCsoEventId, assertCsoSetName, isCsoTimestamp, parseCsoCatalogue, parseCsoEvent, parseCsoEvents,
  parseCsoHealth, parseCsoRevisions, parseCsoSetActivity, parseCsoStatus, CSO_SET_ACTIVITY_MAX_ITEMS,
} from "./csoContract.js";

export const CSO_STATUS_BATCH_LIMIT = 20;
export const CSO_EVENTS_MAX_WINDOW_MS = 366 * 86400000;

const API_CODES = new Set([
  "VALIDATION_ERROR", "MEASUREMENT_NOT_FOUND", "INVALID_CURSOR", "CURSOR_EXPIRED",
  "CURSOR_STALE", "ARCHIVE_INTEGRITY", "STORAGE_UNAVAILABLE", "QUERY_TIMEOUT", "FORBIDDEN", "NOT_FOUND",
  "RESULT_TOO_LARGE", "RELEASE_NOT_AVAILABLE", "DATA_INTEGRITY", "ASSET_NOT_FOUND", "EVENT_NOT_FOUND", "SET_NOT_FOUND",
  "RELATIONSHIPS_NOT_PUBLISHED", "IMPACT_NOT_CONFIGURED", "SET_NOT_APPROVED", "CSO_UNAVAILABLE",
]);
const RETRY_CODES = new Set(["THROTTLED", "UPSTREAM_ERROR", "STORAGE_UNAVAILABLE", "QUERY_TIMEOUT", "NETWORK_ERROR"]);

function httpError(status, body) {
  if (status === 413) return new RdpError("RESULT_TOO_LARGE", status);
  if (status === 403 || status === 401) return new RdpError("AUTHORIZATION_FAILED", status);
  if (status === 429) return new RdpError("THROTTLED", status);
  const code = API_CODES.has(body?.error?.code) ? body.error.code : "UPSTREAM_ERROR";
  return new RdpError(code, status);
}

function validateEnvelope(payload, kind, ids) {
  if (!payload || !payload.meta || typeof payload.meta !== "object" ||
      (kind === "health" ? !payload.data || payload.data.measurementId !== ids[0] : !Array.isArray(payload.data))) {
    throw new RdpError("RESPONSE_CONTRACT_ERROR");
  }
  if (kind === "latest") {
    if (payload.data.length !== ids.length || payload.data.some((row, i) =>
      row.measurementId !== ids[i] || row.unit !== getCanonicalMeasurement(ids[i]).unit ||
      !["available", "no_observations", "unavailable"].includes(row.status) ||
      !["fresh", "stale", "unknown"].includes(row.freshness) ||
      (row.status === "available" && (!Number.isFinite(row.value) || !Number.isFinite(Date.parse(row.observedAt)))))) {
      throw new RdpError("RESPONSE_CONTRACT_ERROR");
    }
  }
  if (kind === "observations") {
    const measure = getCanonicalMeasurement(ids[0]);
    if (payload.meta.measurementId !== ids[0] || payload.meta.pageIntegrity !== "verified" ||
        payload.data.some((row) => row.unit !== measure.unit || row.datum !== measure.datum ||
          row.providerMeasureId !== measure.providerMeasureId || row.sourceId !== "ea-flood-monitoring" ||
          !Number.isFinite(row.value) || !Number.isFinite(Date.parse(row.observedAt)))) {
      throw new RdpError("RESPONSE_CONTRACT_ERROR");
    }
  }
  return payload;
}

// Construct lazily inside server code. No default AWS credential chain or local-token fallback.
export function createRdpClient(env = process.env) {
  const config = getRdpConfig(env);
  const sts = new STSClient({
    region: config.region, endpoint: `https://sts.${config.region}.amazonaws.com`, maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 5000, throwOnRequestTimeout: true },
  });
  let credentials;
  async function getCredentials(signal) {
    if (credentials && credentials.expiration.getTime() > Date.now() + 60000) return credentials;
    let onAbort;
    const aborted = new Promise((resolve, reject) => {
      onAbort = () => reject(new RdpError("TIMEOUT"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      signal.throwIfAborted();
      const token = await Promise.race([getVercelOidcToken(), aborted]);
      signal.throwIfAborted();
      const result = await sts.send(new AssumeRoleWithWebIdentityCommand({
        RoleArn: config.roleArn, RoleSessionName: `ishppopen-${config.stage}`, DurationSeconds: 900,
        WebIdentityToken: token,
      }), { abortSignal: signal });
      const value = result.Credentials;
      if (!value?.AccessKeyId || !value.SecretAccessKey || !value.SessionToken ||
          !(value.Expiration instanceof Date) || !Number.isFinite(value.Expiration.getTime()) || value.Expiration.getTime() <= Date.now() + 60000) {
        throw new Error();
      }
      credentials = { accessKeyId: value.AccessKeyId, secretAccessKey: value.SecretAccessKey,
        sessionToken: value.SessionToken, expiration: value.Expiration };
      return credentials;
    } catch {
      throw new RdpError(signal.aborted ? "TIMEOUT" : "AUTHENTICATION_FAILED");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  async function request(path, query, parse, bounded = false) {
    const url = new URL(`${config.apiUrl}${path}`);
    url.search = new URLSearchParams(query).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let failure;
        let retryAfter = 0;
        try {
          const signer = new SignatureV4({ service: "execute-api", region: config.region,
            credentials: await getCredentials(controller.signal), sha256: Hash.bind(null, "sha256") });
          const signed = await signer.sign({ method: "GET", protocol: url.protocol, hostname: url.hostname,
            path: url.pathname, query: Object.fromEntries(url.searchParams), headers: { host: url.host } });
          const response = await fetch(url.toString(), { method: "GET", headers: signed.headers,
            cache: "no-store", redirect: "error", signal: controller.signal });
          let body;
          // `bounded` is true (the shared river cap) or an explicit byte cap for a larger bounded body.
          try {
            body = bounded && response.ok ? await readRiverJson(response, typeof bounded === "number" ? bounded : undefined) : await response.json();
          } catch (error) {
            if (error instanceof RdpError) throw error;
            if (response.ok) throw new RdpError("RESPONSE_CONTRACT_ERROR");
          }
          if (response.ok) return parse(body);
          failure = httpError(response.status, body);
          retryAfter = Math.min(2000, Math.max(0, Number(response.headers.get("retry-after")) * 1000 || 0));
        } catch (error) {
          failure = controller.signal.aborted ? new RdpError("TIMEOUT") :
            error instanceof RdpError ? error : new RdpError("NETWORK_ERROR");
        }
        if (attempt === 1 || !RETRY_CODES.has(failure.code) || (failure.status && failure.status < 500 && failure.status !== 429)) throw failure;
        await delay(Math.max(retryAfter, 200 + Math.floor(Math.random() * 200)), undefined, { signal: controller.signal });
      }
    } catch (error) {
      throw controller.signal.aborted ? new RdpError("TIMEOUT") : error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function read(path, query, kind, ids = []) {
    return request(`/v1/measurements${path}`, query, (body) => validateEnvelope(body, kind, ids));
  }

  return Object.freeze({
    // CSO reads (#72 PR 3). Bounded bodies, validated query bounds and fully validated envelopes.
    listCsoOutfalls({ limit = 1000, cursor } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RdpError("INVALID_QUERY");
      assertCsoCursor(cursor);
      return request("/v1/cso/outfalls", { limit: String(limit), ...(cursor === undefined ? {} : { cursor }) }, parseCsoCatalogue, true);
    },
    getCsoStatus(ids) {
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > CSO_STATUS_BATCH_LIMIT || new Set(ids).size !== ids.length) throw new RdpError("INVALID_QUERY");
      ids.forEach(assertCsoAssetId);
      return request("/v1/cso/outfalls/status", { ids: ids.join(",") }, (body) => parseCsoStatus(body, ids), true);
    },
    getCsoEvents(id, { from, to, limit = 100, cursor } = {}) {
      assertCsoAssetId(id);
      assertCsoCursor(cursor);
      if (!isCsoTimestamp(from) || !isCsoTimestamp(to) || !from.endsWith("Z") || !to.endsWith("Z") ||
          Date.parse(from) >= Date.parse(to) || Date.parse(to) - Date.parse(from) > CSO_EVENTS_MAX_WINDOW_MS ||
          !Number.isInteger(limit) || limit < 1 || limit > 500) throw new RdpError("INVALID_QUERY");
      return request(`/v1/cso/outfalls/${id}/events`,
        { from, to, limit: String(limit), ...(cursor === undefined ? {} : { cursor }) }, (body) => parseCsoEvents(body, id), true);
    },
    getCsoEvent(eventId) {
      assertCsoEventId(eventId);
      return request(`/v1/cso/events/${eventId}`, {}, (body) => parseCsoEvent(body, eventId), true);
    },
    getCsoEventRevisions(eventId, { limit = 50, cursor } = {}) {
      assertCsoEventId(eventId);
      assertCsoCursor(cursor);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RdpError("INVALID_QUERY");
      return request(`/v1/cso/events/${eventId}/revisions`, { limit: String(limit), ...(cursor === undefined ? {} : { cursor }) },
        (body) => parseCsoRevisions(body, eventId), true);
    },
    // One page of a collection set's status, events and coverage (ADR-002 D3). Callers walk `nextCursor`.
    getCsoSetActivity(set, { hours = 48, limit = CSO_SET_ACTIVITY_MAX_ITEMS, cursor } = {}) {
      assertCsoSetName(set);
      assertCsoCursor(cursor);
      if (!Number.isInteger(hours) || hours < 1 || hours > 168 || !Number.isInteger(limit) || limit < 1 || limit > CSO_SET_ACTIVITY_MAX_ITEMS) {
        throw new RdpError("INVALID_QUERY");
      }
      return request(`/v1/cso/sets/${set}/activity`, { hours: String(hours), limit: String(limit), ...(cursor === undefined ? {} : { cursor }) },
        (body) => parseCsoSetActivity(body, set, hours), true);
    },
    getCsoHealth(id) {
      assertCsoAssetId(id);
      return request(`/v1/cso/outfalls/${id}/health`, {}, (body) => parseCsoHealth(body, id), true);
    },
    // A published, RDP-verified upstream-outfall relationship set (ADR-002 D5). Bounded body; strict validation.
    getRiverRelationships(set) {
      assertRelationshipSetId(set);
      return request(`/v1/river/relationships/${set}`, {}, (body) => parseRelationshipSet(body, set), true);
    },
    // Live status-aware downstream impact for one reviewed relationship set (RDP caches it per 5-minute bucket).
    getRiverImpact(set, { hours = 48 } = {}) {
      assertRiverImpactQuery(set, hours);
      return request(`/v1/river/impact/${set}`, { hours: String(hours) }, (body) => parseRiverImpact(body, set, hours), RIVER_IMPACT_MAX_BYTES);
    },
    locateRiver(point) {
      return request("/v1/river/locate", riverCoordinates(point), parseRiverLocation, true);
    },
    getRiverTrace(location, direction, geometry = "reaches") {
      const path = riverSamplePath(location, direction, geometry);
      return request(path, { geometry }, (body) => parseRiverTrace(body, location, direction, geometry), true);
    },
    listMeasurements: () => read("", {}, "registry"),
    getLatest(ids) {
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length) throw new RdpError("INVALID_QUERY");
      ids.forEach(getCanonicalMeasurement);
      return read("/latest", { ids: ids.join(",") }, "latest", ids);
    },
    getHealth(id) {
      getCanonicalMeasurement(id);
      return read(`/${id}/health`, {}, "health", [id]);
    },
    getObservations(id, { from, to, limit = 2000, cursor } = {}) {
      getCanonicalMeasurement(id);
      const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
      if (!timestamp(from) || !timestamp(to) || Date.parse(from) >= Date.parse(to) ||
          Date.parse(to) - Date.parse(from) > 366 * 86400000 || !Number.isInteger(limit) || limit < 1 || limit > 5000 ||
          (cursor !== undefined && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,7000}$/.test(cursor)))) throw new RdpError("INVALID_QUERY");
      return read(`/${id}/observations`, { from, to, limit: String(limit), ...(cursor === undefined ? {} : { cursor }) }, "observations", [id]);
    },
  });
}
