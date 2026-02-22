import { parseCSVToStability } from '../../libs/csvParser';
import { getMethodHandler } from '../../libs/api/http';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const s3Url = process.env.S3_FORECAST_STABILITY_URL;

      // Return empty data if URL not configured (stability data is optional)
      if (!s3Url) {
        console.log(`[${timestamp}] S3_FORECAST_STABILITY_URL not set - returning empty stability data`);
        res.status(200).json({ stability_data: [] });
        return;
      }

      const response = await fetch(s3Url);

      // Return empty data if file doesn't exist yet (stability data is optional)
      if (!response.ok) {
        console.log(`[${timestamp}] Stability file not available (${response.status}) - returning empty data`);
        res.status(200).json({ stability_data: [] });
        return;
      }

      const csvText = await response.text();
      const stabilityData = parseCSVToStability(csvText);

      console.log(`${timestamp} S3 STABILITY CALLED - ${stabilityData.length} rows`);

      res.status(200).json({
        stability_data: stabilityData,
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
    console.error(`[${timestamp}] Error in forecaststability:`, error);
    // Return empty data on error rather than failing
    res.status(200).json({ stability_data: [] });
  }
}
