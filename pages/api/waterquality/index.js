import { connectToDatabase } from "../../../libs/database";

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  if (req.method === "GET") {
    try {
      const { db } = await connectToDatabase();
      const collection = await db.collection("waterQuality");
      const csoDataCollection = await db.collection("csoData");

      const cursor = await collection
        .find()
        .sort({ scrape_timestamp: -1 })
        .limit(1);
      let waterQualityData = await cursor.next();

      if (waterQualityData) {
        // Calculate the time range for the previous 48 hours
        const scrapeTimestamp = new Date(waterQualityData.scrape_timestamp);
        const startTime = new Date(
          scrapeTimestamp.getTime() - 48 * 60 * 60 * 1000
        );
        // Fetch the currently active CSOs in the previous 48 hours
        const activeCSOs = await csoDataCollection
          .aggregate([
            {
              $match: {
                DateScraped: { $gte: startTime, $lte: scrapeTimestamp },
              },
            },
            {
              $sort: { DateScraped: -1 },
            },
            {
              $group: {
                _id: "$attributes.Id",
                mostRecent: { $first: "$$ROOT" },
              },
            },
            {
              $match: {
                "mostRecent.attributes.Status": 1,
              },
            },
          ])
          .toArray();

        // Get the count and IDs of the active CSOs
        const activeCSOCount = activeCSOs.length;
        const activeCSOIds = activeCSOs.map((cso) => cso._id);

        // Calculate the total discharge time from the last 48 hours
        let totalDischargeTime = 0;
        const currentTime = new Date();

        activeCSOs.forEach((cso) => {
          const { attributes } = cso.mostRecent;
          const eventStart = new Date(attributes.LatestEventStart);
          totalDischargeTime += currentTime - eventStart;
        });

        // Convert total discharge time from milliseconds to hours
        totalDischargeTime = totalDischargeTime / (1000 * 60 * 60);

        // Add the active CSO count and IDs to the water quality data
        waterQualityData.activeCSOCount = activeCSOCount;
        waterQualityData.activeCSOIds = activeCSOIds;
        waterQualityData.totalDischargeTime = totalDischargeTime.toFixed(3);    

        // Remove unwanted fields and convert keys to PascalCase
        const { _id, distance_meters, ...rest } = waterQualityData;
        waterQualityData = {
          Id: rest.id,
          ScrapeTimestamp: rest.scrape_timestamp,
          WaterQuality: {
            NumberUpstreamCSOs: rest.water_quality.number_upstream_CSOs,
            NumberCSOsPerKm2: rest.water_quality.number_CSOs_per_km2,
            CSOIds: rest.water_quality.CSO_IDs,
            CSOActiveTime: rest.totalDischargeTime,
          },
          ActiveCSOCount: rest.activeCSOCount,
          ActiveCSOIds: rest.activeCSOIds,
        };
      }

      console.log(`${timestamp} WATERQUALITY MOST RECENT CALLED`);
      res.status(200).json({
        waterQualityData,
      });
    } catch (error) {
      console.error(`[${timestamp}] Error in waterquality:`, error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  } else {
    // Handle any other HTTP method
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
