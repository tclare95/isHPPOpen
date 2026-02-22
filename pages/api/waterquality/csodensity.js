import { connectToDatabase } from "../../../libs/database";
import { getMethodHandler, mapApiError } from "../../../libs/api/http";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const parsedHours = Number(req.query.hours);
  const hours = Number.isFinite(parsedHours) ? parsedHours : 120;
  const handlers = {
    GET: async () => {
      const { db } = await connectToDatabase();
      const collection = await db.collection("waterQuality");

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      const cursor = await collection
        .find({ scrape_timestamp: { $gte: startTime, $lte: endTime } })
        .sort({ scrape_timestamp: 1 });

      const timeSeriesData = await cursor.toArray();

      const result = timeSeriesData
        .map((data) => {
          const rowTimestamp = data?.scrape_timestamp;
          const numberCSOsPerKm2 = Number(data?.water_quality?.number_CSOs_per_km2);

          if (!rowTimestamp || !Number.isFinite(numberCSOsPerKm2)) {
            return null;
          }

          return {
            timestamp: rowTimestamp,
            numberCSOsPerKm2,
          };
        })
        .filter(Boolean);

      console.log(`${timestamp} CSODENSITY TIME SERIES CALLED`);
      res.status(200).json(result);
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
    console.error(`[${timestamp}] Error in csodensity:`, error);
    res.status(statusCode).json({ message });
  }
}
