import { connectToDatabase } from "../../../libs/database";
import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";

export const revalidate = 900;

async function getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp) {
  return csoDataCollection
    .aggregate([
      { $match: { DateScraped: { $gte: startTime, $lte: scrapeTimestamp } } },
      { $sort: { DateScraped: -1 } },
      { $group: { _id: "$attributes.Id", mostRecent: { $first: "$$ROOT" } } },
      {
        $match: {
          "mostRecent.attributes.Status": 1,
          "mostRecent.attributes.LatestEventStart": { $gte: startTime, $lte: scrapeTimestamp },
        },
      },
    ])
    .toArray();
}

function getTotalDischargeHours(activeCSOs) {
  let total = 0;
  const now = new Date();
  activeCSOs.forEach((cso) => {
    const eventStart = new Date(cso?.mostRecent?.attributes?.LatestEventStart);
    if (!Number.isNaN(eventStart.getTime())) total += now - eventStart;
  });
  return Number((total / (1000 * 60 * 60)).toFixed(3));
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("waterQuality");
    const csoDataCollection = db.collection("csoData");

    const latest = await collection.find().sort({ scrape_timestamp: -1 }).limit(1).next();
    let waterQualityData = null;

    if (latest) {
      const scrapeTimestamp = new Date(latest.scrape_timestamp);
      const startTime = new Date(scrapeTimestamp.getTime() - 48 * 60 * 60 * 1000);
      const activeCSOs = await getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp);
      const totalDischargeHours = getTotalDischargeHours(activeCSOs);
      const waterQuality = latest?.water_quality || {};

      waterQualityData = {
        Id: latest?.id ?? null,
        ScrapeTimestamp: latest?.scrape_timestamp ?? null,
        WaterQuality: {
          NumberUpstreamCSOs: Number(waterQuality?.number_upstream_CSOs) || 0,
          NumberCSOsPerKm2: Number(waterQuality?.number_CSOs_per_km2) || 0,
          CSOIds: Array.isArray(waterQuality?.CSO_IDs) ? waterQuality.CSO_IDs : [],
          CSOActiveTime: Number.isFinite(totalDischargeHours) ? totalDischargeHours : 0,
        },
        ActiveCSOCount: activeCSOs.length,
        ActiveCSOIds: activeCSOs.map((cso) => cso._id),
      };
    }

    return sendRouteSuccess({ waterQualityData });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
