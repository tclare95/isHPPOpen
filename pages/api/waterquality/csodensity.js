import { connectToDatabase } from "../../../libs/database";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const parsedHours = Number(req.query.hours);
  const hours = Number.isFinite(parsedHours) ? parsedHours : 120;

  if (req.method === "GET") {
    try {
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
          const timestamp = data?.scrape_timestamp;
          const numberCSOsPerKm2 = Number(data?.water_quality?.number_CSOs_per_km2);

          if (!timestamp || !Number.isFinite(numberCSOsPerKm2)) {
            return null;
          }

          return {
            timestamp,
            numberCSOsPerKm2,
          };
        })
        .filter(Boolean);

      console.log(`${timestamp} CSODENSITY TIME SERIES CALLED`);
      res.status(200).json(result);
    } catch (error) {
      console.error(`[${timestamp}] Error in csodensity:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    // Handle any other HTTP method
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
