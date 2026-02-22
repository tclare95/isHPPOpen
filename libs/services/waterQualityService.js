import { connectToDatabase } from '../database';

export async function getLatestWaterQualityData() {
  const { db } = await connectToDatabase();
  const collection = await db.collection('waterQuality');
  const csoDataCollection = await db.collection('csoData');

  const cursor = await collection.find().sort({ scrape_timestamp: -1 }).limit(1);
  let waterQualityData = await cursor.next();

  if (!waterQualityData) {
    return null;
  }

  const scrapeTimestamp = new Date(waterQualityData.scrape_timestamp);
  const startTime = new Date(scrapeTimestamp.getTime() - 48 * 60 * 60 * 1000);

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
          _id: '$attributes.Id',
          mostRecent: { $first: '$$ROOT' },
        },
      },
      {
        $match: {
          'mostRecent.attributes.Status': 1,
          'mostRecent.attributes.LatestEventStart': {
            $gte: startTime,
            $lte: scrapeTimestamp,
          },
        },
      },
    ])
    .toArray();

  const activeCSOCount = activeCSOs.length;
  const activeCSOIds = activeCSOs.map((cso) => cso._id);

  let totalDischargeTime = 0;
  const currentTime = new Date();

  activeCSOs.forEach((cso) => {
    const { attributes } = cso.mostRecent;
    const eventStart = new Date(attributes.LatestEventStart);
    totalDischargeTime += currentTime - eventStart;
  });

  totalDischargeTime = totalDischargeTime / (1000 * 60 * 60);

  waterQualityData.activeCSOCount = activeCSOCount;
  waterQualityData.activeCSOIds = activeCSOIds;
  waterQualityData.totalDischargeTime = totalDischargeTime.toFixed(3);

  const { _id, distance_meters, ...rest } = waterQualityData;
  return {
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
