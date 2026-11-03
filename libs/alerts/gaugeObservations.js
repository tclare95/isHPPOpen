import "server-only";
import { getRdpMeasurement } from "../rdp/measurements.js";
import {
  GAUGE_ALERT_LOOKBACK_MS,
  GAUGE_ALERT_ROW_BUDGET,
  normalizeObservedAt,
  sameValue,
} from "./gaugeAlertDecision";

// Alert-safe live gauge reads (#51 Slice D). One bounded, uncached read per measurement and run,
// from exactly one source. There is deliberately no display fallback, no in-process last-known
// snapshot and no 900-second display cache here: a failed read only skips that gauge's rules.

export const GAUGE_ALERT_READ_DEADLINE_MS = 10000;
const EA_MEASURES_URL = "https://environment.data.gov.uk/flood-monitoring/id/measures";
// Live EA readings carry no quality (RDP stores null). Any other stated quality is not trusted.
const ACCEPTED_QUALITY = new Set(["Good", "Unchecked"]);

const failure = (code) => Object.assign(new Error(`Gauge alert read ${code}`), { code });

function qualityAccepted(quality) {
  if (quality === null || quality === undefined) return true;
  let value = quality;
  // RDP keeps the provider's raw JSON text, e.g. "\"Good\"".
  if (typeof value === "string" && value.startsWith("\"")) {
    try { value = JSON.parse(value); } catch { return false; }
  }
  return typeof value === "string" && ACCEPTED_QUALITY.has(value);
}

/**
 * Builds the normalized read from identity-verified rows: ascending, one entry per instant.
 * Rows with an untrusted quality, non-finite value, or invalid/future time are ineligible.
 * Different values at one instant are reported as conflicts and never chosen between.
 */
export function buildGaugeRead({ source, gaugeKey, measurementId, rows, now, windowStart }) {
  const byTime = new Map();
  const conflicts = new Set();
  let rejectedRows = 0;

  for (const row of rows) {
    const time = Date.parse(row.observedAt);
    if (typeof row.observedAt !== "string" || !Number.isFinite(time) || time > now.getTime() ||
        typeof row.value !== "number" || !Number.isFinite(row.value) || !qualityAccepted(row.quality)) {
      rejectedRows += 1;
      continue;
    }
    if (time < windowStart.getTime()) continue;
    const existing = byTime.get(time);
    if (!existing) byTime.set(time, { at: normalizeObservedAt(time), time, value: row.value });
    else if (!sameValue(existing.value, row.value)) conflicts.add(time);
  }

  return {
    ok: true,
    source,
    gaugeKey,
    measurementId,
    windowStart: normalizeObservedAt(windowStart),
    observations: [...byTime.values()].sort((left, right) => left.time - right.time),
    conflicts: [...conflicts].sort((left, right) => left - right),
    rejectedRows,
  };
}

/** Environment Agency readings for the exact provider measure, uncached. */
async function readLegacyRows(measure, windowStart, signal) {
  const url = `${EA_MEASURES_URL}/${encodeURIComponent(measure.providerMeasureId)}/readings?_sorted&since=${normalizeObservedAt(windowStart)}&_limit=${GAUGE_ALERT_ROW_BUDGET + 1}`;
  let response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch {
    throw failure(signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
  }
  if (!response.ok) throw failure("UPSTREAM_ERROR");
  let payload;
  try { payload = await response.json(); } catch { throw failure("RESPONSE_CONTRACT_ERROR"); }
  const items = payload?.items;
  if (!Array.isArray(items)) throw failure("RESPONSE_CONTRACT_ERROR");
  if (items.length > GAUGE_ALERT_ROW_BUDGET) throw failure("CATCHUP_BUDGET_EXCEEDED");
  const expected = `/measures/${measure.providerMeasureId}`;
  if (items.some((item) => typeof item?.measure !== "string" || !item.measure.endsWith(expected))) throw failure("MEASUREMENT_CONTRACT_ERROR");
  return items.map((item) => ({ observedAt: item.dateTime, value: item.value, quality: item.quality }));
}

/** RDP observations for the canonical measurement, read directly (never the display cache). */
async function readRdpRows(client, measure, windowStart, now) {
  // The client validates measurement, unit, datum, provider measure, source and page integrity.
  const page = await client.getObservations(measure.measurementId, {
    from: normalizeObservedAt(windowStart), to: normalizeObservedAt(now), limit: GAUGE_ALERT_ROW_BUDGET + 1,
  });
  if (page.data.length > GAUGE_ALERT_ROW_BUDGET || page.meta.nextCursor) throw failure("CATCHUP_BUDGET_EXCEEDED");
  return page.data.map((row) => ({ observedAt: row.observedAt, value: row.value, quality: row.quality }));
}

async function createClient() {
  const { createRdpClient } = await import("../rdp/client.js");
  return createRdpClient();
}

function withDeadline(work, ms) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(failure("TIMEOUT"));
    }, ms);
  });
  return Promise.race([work(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

/**
 * Reads every requested gauge from one pinned source. Never rejects: each gauge resolves to an
 * `ok` read or `{ ok: false, error }` carrying a fixed code only (no provider bodies or credentials).
 */
export async function readGaugeAlertObservations({ source, gaugeKeys, now, deadlineMs = GAUGE_ALERT_READ_DEADLINE_MS }) {
  const windowStart = new Date(now.getTime() - GAUGE_ALERT_LOOKBACK_MS);
  let client = null;
  if (source === "rdp") {
    try {
      client = await createClient();
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "CONFIGURATION_ERROR";
      return new Map(gaugeKeys.map((gaugeKey) => [gaugeKey, { ok: false, source, gaugeKey, error: code }]));
    }
  }

  const entries = await Promise.all(gaugeKeys.map(async (gaugeKey) => {
    try {
      const measure = getRdpMeasurement(gaugeKey);
      const rows = await withDeadline((signal) => (source === "rdp" ? readRdpRows(client, measure, windowStart, now) : readLegacyRows(measure, windowStart, signal)), deadlineMs);
      return [gaugeKey, buildGaugeRead({ source, gaugeKey, measurementId: measure.measurementId, rows, now, windowStart })];
    } catch (error) {
      return [gaugeKey, { ok: false, source, gaugeKey, error: typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR" }];
    }
  }));
  return new Map(entries);
}
