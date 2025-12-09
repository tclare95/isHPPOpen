import { parseCSVToStability } from '../../libs/csvParser';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const s3Url = process.env.S3_FORECAST_STABILITY_URL;
    
    // Return empty data if URL not configured (stability data is optional)
    if (!s3Url) {
      console.log(`[${timestamp}] S3_FORECAST_STABILITY_URL not set - returning empty stability data`);
      return res.status(200).json({ stability_data: [] });
    }

    const response = await fetch(s3Url);
    
    // Return empty data if file doesn't exist yet (stability data is optional)
    if (!response.ok) {
      console.log(`[${timestamp}] Stability file not available (${response.status}) - returning empty data`);
      return res.status(200).json({ stability_data: [] });
    }

    const csvText = await response.text();
    const stabilityData = parseCSVToStability(csvText);

    console.log(`${timestamp} S3 STABILITY CALLED - ${stabilityData.length} rows`);
    
    res.status(200).json({
      stability_data: stabilityData,
    });
  } catch (error) {
    console.error(`[${timestamp}] Error in forecaststability:`, error);
    // Return empty data on error rather than failing
    res.status(200).json({ stability_data: [] });
  }
}
