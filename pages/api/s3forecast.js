import { parseCSVToForecastWithStability } from '../../libs/csvParser';
import { getMethodHandler, HttpError, mapApiError, sendApiError, sendApiSuccess } from '../../libs/api/http';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const s3Url = process.env.S3_FORECAST_URL;

      if (!s3Url) {
        console.error(`[${timestamp}] S3_FORECAST_URL environment variable not set`);
        throw new HttpError(500, 'Forecast URL not configured');
      }

      const response = await fetch(s3Url);

      if (!response.ok) {
        console.error(`[${timestamp}] Failed to fetch from S3: ${response.status}`);
        throw new HttpError(502, 'Failed to fetch forecast data');
      }

      const csvText = await response.text();
      const forecastData = parseCSVToForecastWithStability(csvText);

      // Extract metadata from first row
      const firstRow = forecastData[0];
      const metadata = firstRow ? {
        forecast_time: firstRow.forecast_time,
        current_level: firstRow.current_level,
      } : null;

      console.log(`${timestamp} S3 FORECAST CALLED - ${forecastData.length} rows`);

      sendApiSuccess(res, {
        forecast_data: forecastData,
        metadata,
      });
    },
  };

  try {
    const methodHandler = getMethodHandler(req, res, handlers);
    if (!methodHandler) {
      return;
    }

    await methodHandler();
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    console.error(`[${timestamp}] Error in s3forecast:`, error);
    sendApiError(res, statusCode, message);
  }
}
