import { connectToDatabase } from "../../../libs/database";
import { getMethodHandler, mapApiError, sendApiError, sendApiSuccess } from "../../../libs/api/http";

async function getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp) {
  return csoDataCollection
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
          "mostRecent.attributes.LatestEventStart": {
            $gte: startTime,
            $lte: scrapeTimestamp,
          },
        },
      },
    ])
    .toArray();
}

function getTotalDischargeHours(activeCSOs) {
  let totalDischargeTime = 0;
  const currentTime = new Date();

  activeCSOs.forEach((cso) => {
    const { attributes } = cso.mostRecent || {};
    const eventStart = new Date(attributes?.LatestEventStart);
    if (!Number.isNaN(eventStart.getTime())) {
      totalDischargeTime += currentTime - eventStart;
    }
  });

  return Number((totalDischargeTime / (1000 * 60 * 60)).toFixed(3));
}

function toWaterQualityResponse(sourceData, activeCSOs, totalDischargeTime) {
  const { _id, distance_meters, ...rest } = sourceData;
  const waterQuality = rest?.water_quality || {};
  const numberUpstreamCSOs = Number(waterQuality?.number_upstream_CSOs);
  const numberCSOsPerKm2 = Number(waterQuality?.number_CSOs_per_km2);
  const csoIds = Array.isArray(waterQuality?.CSO_IDs) ? waterQuality.CSO_IDs : [];
  const activeCSOIds = activeCSOs.map((cso) => cso._id);

  return {
    Id: rest?.id ?? null,
    ScrapeTimestamp: rest?.scrape_timestamp ?? null,
    WaterQuality: {
      NumberUpstreamCSOs: Number.isFinite(numberUpstreamCSOs) ? numberUpstreamCSOs : 0,
      NumberCSOsPerKm2: Number.isFinite(numberCSOsPerKm2) ? numberCSOsPerKm2 : 0,
      CSOIds: csoIds,
      CSOActiveTime: Number.isFinite(totalDischargeTime) ? totalDischargeTime : 0,
    },
    ActiveCSOCount: activeCSOs.length,
    ActiveCSOIds: activeCSOIds,
  };
}

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    GET: async () => {
      const { db } = await connectToDatabase();
      const collection = await db.collection("waterQuality");
      const csoDataCollection = await db.collection("csoData");

      const cursor = await collection
        .find()
        .sort({ scrape_timestamp: -1 })
        .limit(1);

      const latestWaterQuality = await cursor.next();
      let waterQualityData = null;

      if (latestWaterQuality) {
        const scrapeTimestamp = new Date(latestWaterQuality.scrape_timestamp);
        const startTime = new Date(scrapeTimestamp.getTime() - 48 * 60 * 60 * 1000);
        const activeCSOs = await getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp);
        const totalDischargeHours = getTotalDischargeHours(activeCSOs);

        waterQualityData = toWaterQualityResponse(
          latestWaterQuality,
          activeCSOs,
          totalDischargeHours
        );
      }

      console.log(`${timestamp} WATERQUALITY MOST RECENT CALLED`);
      sendApiSuccess(res, {
        waterQualityData,
      });
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
    console.error(`[${timestamp}] Error in waterquality:`, error);
    return sendApiError(res, statusCode, message);
  }
}
