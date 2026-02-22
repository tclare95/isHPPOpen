import { parseCSVToAccuracy } from '../../libs/csvParser';
import { getMethodHandler, HttpError, mapApiError } from '../../libs/api/http';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const s3Url = process.env.S3_FORECAST_ACCURACY_URL;

      if (!s3Url) {
        console.error(`[${timestamp}] S3_FORECAST_ACCURACY_URL environment variable not set`);
        throw new HttpError(500, 'Forecast accuracy URL not configured');
      }

      const response = await fetch(s3Url);

      if (!response.ok) {
        console.error(`[${timestamp}] Failed to fetch accuracy data from S3: ${response.status}`);
        throw new HttpError(502, 'Failed to fetch forecast accuracy data');
      }

      const csvText = await response.text();
      const accuracyData = parseCSVToAccuracy(csvText);

      // Extract evaluation time from first row
      const evaluationTime = accuracyData[0]?.evaluation_time || null;

      console.log(`${timestamp} S3 FORECAST ACCURACY CALLED - ${accuracyData.length} rows`);

      res.status(200).json({
        accuracy_data: accuracyData,
        evaluation_time: evaluationTime,
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
    console.error(`[${timestamp}] Error in forecastaccuracy:`, error);
    res.status(statusCode).json({ message });
  }
}
