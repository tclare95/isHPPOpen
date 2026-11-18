import { HttpError } from "../api/http";
import { createRequestLogger } from "../api/logger";
import calibration from "../waterQualityCalibration.json";
import { buildWaterQualityIndicator } from "../waterQualityIndicator";
import { getLatestLevelsSnapshot } from "./levelsService";
import { getLatestWaterQualitySummaryHealth, getWaterQualityDensitySeries } from "./waterQualityService";

// `RDP_WQ_ASSESSMENT` (default `legacy`) selects the water-quality assessment for the indication, its chart and
// water-quality alerts. It is independent of RDP_CSO_SOURCE / RDP_CSO_MEMBERSHIP, which select map and status.
// - legacy: Sewage Map density from Mongo `waterQuality` (the calibrated 2026-08-31 indicator), unchanged.
// - shadow: legacy is authoritative; the RDP assessment is computed alongside and reported, never acted on.
// - rdp:    the versioned RDP assessment. Nothing reads Mongo `waterQuality` for it, and it never falls back to legacy.
// Unset (or `legacy`) to roll back. See docs/RDP-WATER-QUALITY-ASSESSMENT.md.
export const WQ_ASSESSMENT_MODES = Object.freeze(["legacy", "shadow", "rdp"]);
export const LEGACY_ASSESSMENT_VERSION = `sewage-map-density/${calibration.version}`;

export function getWaterQualityAssessmentMode(env = process.env) {
  const mode = env.RDP_WQ_ASSESSMENT ?? "legacy";
  return WQ_ASSESSMENT_MODES.includes(mode) ? mode : null;
}

export function resolveWaterQualityAssessmentMode(env = process.env) {
  const mode = getWaterQualityAssessmentMode(env);
  if (mode === null) createRequestLogger({ method: "GET" }, "wq-assessment").error("Invalid RDP_WQ_ASSESSMENT; using legacy");
  return mode ?? "legacy";
}

export function validateAssessmentHours(value) {
  const hours = value === null || value === undefined ? 0 : Number(value);
  if (![0, 24, 120].includes(hours)) throw new HttpError(400, "hours must be 0, 24 or 120");
  return hours;
}

/** Legacy indicator in the shared assessment shape. Its history stays the density series (`/api/waterquality/csodensity`). */
export async function getLegacyWaterQualityAssessment({ now = new Date() } = {}) {
  const [density, levels, summary] = await Promise.allSettled([getWaterQualityDensitySeries(3, now), getLatestLevelsSnapshot(), getLatestWaterQualitySummaryHealth(now)]);
  const csoData = density.status === "fulfilled" ? density.value : [];
  const levelData = levels.status === "fulfilled" ? levels.value?.level_data ?? [] : [];
  const indicator = buildWaterQualityIndicator({ csoData, levelData, now });
  const observedAt = indicator.cso.observedAt ?? null;
  return {
    source: "legacy",
    version: LEGACY_ASSESSMENT_VERSION,
    current: { version: LEGACY_ASSESSMENT_VERSION, observedAt, level: indicator.level, label: indicator.label, atLeast: Boolean(indicator.atLeast), partial: indicator.partial,
      reasons: indicator.reasons, factors: { cso: { factor: "sewage_map_density", ...indicator.cso }, runoff: { factor: "river_rise_4h", ...indicator.runoff } } },
    history: null,
    legacyHistory: { route: "/api/waterquality/csodensity", unit: "Sewage Map CSO activity per km²", thresholds: calibration.waterQuality },
    health: summary.status === "fulfilled" ? summary.value?.health ?? null : null,
  };
}

async function rdpAssessment(options) {
  // Loaded only outside legacy so the default path never touches the server-only RDP client.
  const { getRdpWaterQualityAssessment } = await import("../rdp/waterQualityAssessment");
  return getRdpWaterQualityAssessment(options);
}

const summariseCurrent = (assessment) => ({ version: assessment.version, level: assessment.current.level, atLeast: assessment.current.atLeast,
  partial: assessment.current.partial, observedAt: assessment.current.observedAt });

/** The assessment for public routes. `shadow` serves legacy and attaches the RDP result as a labelled comparison. */
export async function getPublicWaterQualityAssessment({ hours = 0, now = new Date() } = {}) {
  const mode = resolveWaterQualityAssessmentMode();
  if (mode === "rdp") return { mode, ...(await rdpAssessment({ hours, now })) };
  const legacy = await getLegacyWaterQualityAssessment({ now });
  if (mode === "legacy") return { mode, ...legacy };
  const rdp = await rdpAssessment({ hours: 0, now }).catch(() => null);
  return { mode, ...legacy, comparison: rdp ? { rdp: summariseCurrent(rdp), legacy: summariseCurrent(legacy) } : { rdp: null, legacy: summariseCurrent(legacy) } };
}

/** For the alert evaluator: the RDP assessment's current point only. */
export async function getRdpAlertAssessment({ now = new Date(), deadlineMs } = {}) {
  return rdpAssessment({ hours: 0, now, deadlineMs });
}

/** Operational health for the admin route: the assessment that is actually in use. */
export async function getWaterQualityAssessmentHealth(now = new Date()) {
  if (resolveWaterQualityAssessmentMode() === "rdp") return (await rdpAssessment({ hours: 0, now })).health;
  return (await getLatestWaterQualitySummaryHealth(now))?.health;
}
