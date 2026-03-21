import { HttpError } from '../api/http';
import { fetchWithOperationalRevalidate } from '../api/fetchWithRevalidate';

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

  return {
    level_data: normalizeReadingsArray(data?.level_readings),
    forecast_data: normalizeReadingsArray(data?.forecast_readings),
  };
}
