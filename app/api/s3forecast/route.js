import { parseCSVToForecastWithStability } from "../../../libs/csvParser";
import { HttpError, mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s3Url = process.env.S3_FORECAST_URL;
    if (!s3Url) throw new HttpError(500, "Forecast URL not configured");

    const response = await fetch(s3Url);
    if (!response.ok) throw new HttpError(502, "Failed to fetch forecast data");

    const csvText = await response.text();
    const forecastData = parseCSVToForecastWithStability(csvText);
    const firstRow = forecastData[0];
    const metadata = firstRow ? {
      forecast_time: firstRow.forecast_time,
      current_level: firstRow.current_level,
    } : null;

    return sendRouteSuccess({ forecast_data: forecastData, metadata });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
