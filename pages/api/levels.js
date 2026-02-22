import { getLevelsData } from '../../libs/services/forecastService';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const timestamp = new Date().toISOString();
  try {
    const data = await getLevelsData();
    console.log(`${timestamp} LEVELS CALLED`);
    res.status(200).json(data);
  } catch (error) {
    console.error(`[${timestamp}] Error in levels:`, error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
