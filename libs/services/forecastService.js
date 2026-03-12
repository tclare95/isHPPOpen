import { parseCSVToForecastWithStability } from "../csvParser";
import { HttpError } from "../api/http";
import { fetchWithOperationalRevalidate } from "../api/fetchWithRevalidate";

export function buildForecastMetadata(forecastData) {
  const firstRow = forecastData[0];

  return firstRow
    ? {
      forecast_time: firstRow.forecast_time,
      current_level: firstRow.current_level,
    }
    : null;
}

export async function getLatestForecastSnapshot() {
  const s3Url = process.env.S3_FORECAST_URL;

  if (!s3Url) {
    throw new HttpError(500, "Forecast URL not configured");
  }

  const response = await fetchWithOperationalRevalidate(s3Url);

  if (!response.ok) {
    throw new HttpError(502, "Failed to fetch forecast data");
  }

  const csvText = await response.text();
  const forecastData = parseCSVToForecastWithStability(csvText);

  return {
    forecast_data: forecastData,
    metadata: buildForecastMetadata(forecastData),
  };
}