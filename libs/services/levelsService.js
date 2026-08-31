import { HttpError } from '../api/http';
import { fetchWithOperationalRevalidate } from '../api/fetchWithRevalidate';
import { buildOperationalHealth, getNewestTimestamp } from "../operationalHealth";

function normalizeReadingsArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function getLatestLevelsSnapshot() {
  const s3Url = process.env.S3_LEVELS_URL;
  if (!s3Url) {
    throw new HttpError(500, 'Levels URL not configured');
  }

  const response = await fetchWithOperationalRevalidate(s3Url);
  if (!response.ok) {
    throw new HttpError(502, 'Failed to fetch levels data');
  }

  const data = await response.json();

  const level_data = normalizeReadingsArray(data?.level_readings);
  const forecast_data = normalizeReadingsArray(data?.forecast_readings);
  return { level_data, forecast_data, health: buildOperationalHealth({ source: "scraper-levels", generatedAt: getNewestTimestamp(data?.generatedAt, data?.timestamp, level_data.map((row) => row.reading_date), forecast_data.map((row) => row.forecast_date)) }) };
}
