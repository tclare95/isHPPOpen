import { parseCSVToAccuracy } from '../../libs/csvParser';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const s3Url = process.env.S3_FORECAST_ACCURACY_URL;
    
    if (!s3Url) {
      console.error(`[${timestamp}] S3_FORECAST_ACCURACY_URL environment variable not set`);
      return res.status(500).json({ message: "Forecast accuracy URL not configured" });
    }

    const response = await fetch(s3Url);
    
    if (!response.ok) {
      console.error(`[${timestamp}] Failed to fetch accuracy data from S3: ${response.status}`);
      return res.status(502).json({ message: "Failed to fetch forecast accuracy data" });
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
  } catch (error) {
    console.error(`[${timestamp}] Error in forecastaccuracy:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
