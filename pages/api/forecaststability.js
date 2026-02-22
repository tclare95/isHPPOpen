import { getForecastStabilityData } from '../../libs/services/forecastService';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const stabilityData = await getForecastStabilityData();
    console.log(`${timestamp} S3 STABILITY CALLED - ${stabilityData.stability_data.length} rows`);
    res.status(200).json(stabilityData);
  } catch (error) {
    console.error(`[${timestamp}] Error in forecaststability:`, error);
    res.status(200).json({ stability_data: [] });
  }
}
