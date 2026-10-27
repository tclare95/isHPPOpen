import { HttpError } from '../api/http';
import { fetchWithOperationalRevalidate } from '../api/fetchWithRevalidate';
import { createRequestLogger } from '../api/logger';
import { buildOperationalHealth, getNewestTimestamp } from "../operationalHealth";

const LEVELS_SOURCE_MODES = ["legacy", "shadow", "rdp"];

export function normalizeReadingsArray(value) {
  return Array.isArray(value) ? value : [];
}

// Raw scraper `levels/latest.json`: the legacy observed readings and the forecast travel together.
export async function fetchLegacyLevelsPayload() {
  const s3Url = process.env.S3_LEVELS_URL;
  if (!s3Url) {
    throw new HttpError(500, 'Levels URL not configured');
  }

  const response = await fetchWithOperationalRevalidate(s3Url);
  if (!response.ok) {
    throw new HttpError(502, 'Failed to fetch levels data');
  }

  return response.json();
}

export async function getLegacyLevelsSnapshot() {
  const data = await fetchLegacyLevelsPayload();

  const level_data = normalizeReadingsArray(data?.level_readings);
  const forecast_data = normalizeReadingsArray(data?.forecast_readings);
  return { level_data, forecast_data, health: buildOperationalHealth({ source: "scraper-levels", generatedAt: getNewestTimestamp(data?.generatedAt, data?.timestamp, level_data.map((row) => row.reading_date), forecast_data.map((row) => row.forecast_date)) }) };
}

// Read independently of the other RDP consumers; an invalid value keeps observed levels on legacy.
export function getLevelsSourceMode(env = process.env) {
  const mode = env.RDP_LEVELS_SOURCE ?? "legacy";
  return LEVELS_SOURCE_MODES.includes(mode) ? mode : null;
}

export async function getLatestLevelsSnapshot() {
  const mode = getLevelsSourceMode();

  if (mode === null) {
    createRequestLogger({ method: "GET" }, "rdp/levels").error("Invalid RDP_LEVELS_SOURCE; serving legacy");
  }

  if (mode === "shadow" || mode === "rdp") {
    // Loaded only outside legacy so the default path never touches the server-only RDP client.
    const { getRdpLevelsSnapshot, getShadowLevelsSnapshot } = await import("../rdp/levelsSource");
    return mode === "rdp" ? getRdpLevelsSnapshot() : getShadowLevelsSnapshot();
  }

  return getLegacyLevelsSnapshot();
}
