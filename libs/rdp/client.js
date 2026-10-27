import "server-only";
import { getVercelOidcToken } from "@vercel/oidc";
import { STSClient, AssumeRoleWithWebIdentityCommand } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";
import { Hash } from "@smithy/hash-node";
import { setTimeout as delay } from "node:timers/promises";
import { getRdpConfig } from "./config.js";
import { getCanonicalMeasurement } from "./measurements.js";
import { RdpError } from "./errors.js";

const API_CODES = new Set([
  "VALIDATION_ERROR", "MEASUREMENT_NOT_FOUND", "INVALID_CURSOR", "CURSOR_EXPIRED",
  "CURSOR_STALE", "ARCHIVE_INTEGRITY", "STORAGE_UNAVAILABLE", "QUERY_TIMEOUT", "FORBIDDEN", "NOT_FOUND",
]);
const RETRY_CODES = new Set(["THROTTLED", "UPSTREAM_ERROR", "STORAGE_UNAVAILABLE", "QUERY_TIMEOUT", "NETWORK_ERROR"]);

function httpError(status, body) {
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

  async function read(path, query, kind, ids = []) {
    const url = new URL(`${config.apiUrl}/v1/measurements${path}`);
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
          try { body = await response.json(); } catch {
            if (response.ok) throw new RdpError("RESPONSE_CONTRACT_ERROR");
          }
          if (response.ok) return validateEnvelope(body, kind, ids);
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

  return Object.freeze({
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
