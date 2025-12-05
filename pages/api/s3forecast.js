export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const s3Url = process.env.S3_FORECAST_URL;
    
    if (!s3Url) {
      console.error(`[${timestamp}] S3_FORECAST_URL environment variable not set`);
      return res.status(500).json({ message: "Forecast URL not configured" });
    }

    const response = await fetch(s3Url);
    
    if (!response.ok) {
      console.error(`[${timestamp}] Failed to fetch from S3: ${response.status}`);
      return res.status(502).json({ message: "Failed to fetch forecast data" });
    }

    const csvText = await response.text();
    const forecastData = parseCSVToForecast(csvText);

    // Extract metadata from first row
    const firstRow = forecastData[0];
    const metadata = firstRow ? {
      forecast_time: firstRow.forecast_time,
      current_level: firstRow.current_level,
    } : null;

    console.log(`${timestamp} S3 FORECAST CALLED - ${forecastData.length} rows`);
    
    res.status(200).json({
      forecast_data: forecastData,
      metadata,
    });
  } catch (error) {
    console.error(`[${timestamp}] Error in s3forecast:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

function parseCSVToForecast(csvText) {
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    return [];
  }

  // Skip header row
  const dataLines = lines.slice(1);

  return dataLines.map(line => {
    const [forecast_time, target_time, horizon_hours, predicted_level, current_level] = line.split(',');
    
    return {
      forecast_date: target_time,
      forecast_reading: parseFloat(predicted_level),
      // Keep original fields for metadata
      forecast_time,
      horizon_hours: parseFloat(horizon_hours),
      current_level: parseFloat(current_level),
    };
  }).filter(row => !isNaN(row.forecast_reading));
}
