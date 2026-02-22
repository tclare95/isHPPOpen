import { getLatestWaterQualityData } from '../../../libs/services/waterQualityService';

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    const waterQualityData = await getLatestWaterQualityData();

    console.log(`${timestamp} WATERQUALITY MOST RECENT CALLED`);
    res.status(200).json({ waterQualityData });
  } catch (error) {
    console.error(`[${timestamp}] Error in waterquality:`, error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
