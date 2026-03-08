import { connectToDatabase } from '../database';

export async function getLatestLevelsSnapshot() {
  const { db } = await connectToDatabase();
  const collection = db.collection('riverschemas');
  const data = await collection.find().sort({ _id: -1 }).limit(1).next();

  return {
    level_data: data?.level_readings ?? [],
    forecast_data: data?.forecast_readings ?? [],
  };
}
