import { connectToDatabase } from '../database';
import { HttpError } from '../api/http';

const HOURS_TO_MS = 60 * 60 * 1000;
const ACTIVE_CSO_LOOKBACK_HOURS = 48;

async function getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp) {
  return csoDataCollection
    .aggregate([
      { $match: { DateScraped: { $gte: startTime, $lte: scrapeTimestamp } } },
      { $sort: { DateScraped: -1 } },
      { $group: { _id: '$attributes.Id', mostRecent: { $first: '$$ROOT' } } },
      {
        $match: {
          'mostRecent.attributes.Status': 1,
          'mostRecent.attributes.LatestEventStart': { $gte: startTime, $lte: scrapeTimestamp },
        },
      },
    ])
    .toArray();
}

function getTotalDischargeHours(activeCSOs, now = new Date()) {
  let total = 0;

  activeCSOs.forEach((cso) => {
    const eventStart = new Date(cso?.mostRecent?.attributes?.LatestEventStart);
    if (!Number.isNaN(eventStart.getTime())) {
      total += now - eventStart;
    }
  });

  return Number((total / HOURS_TO_MS).toFixed(3));
}

export async function getLatestWaterQualitySnapshot(now = new Date()) {
  const { db } = await connectToDatabase();
  const collection = db.collection('waterQuality');
  const csoDataCollection = db.collection('csoData');

  const latest = await collection.find().sort({ scrape_timestamp: -1 }).limit(1).next();
  if (!latest) {
    return null;
  }

  const scrapeTimestamp = new Date(latest.scrape_timestamp);
  const startTime = new Date(scrapeTimestamp.getTime() - ACTIVE_CSO_LOOKBACK_HOURS * HOURS_TO_MS);
  const activeCSOs = await getActiveCSOs(csoDataCollection, startTime, scrapeTimestamp);
  const totalDischargeHours = getTotalDischargeHours(activeCSOs, now);
  const waterQuality = latest?.water_quality || {};

  return {
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

export async function getWaterQualityDensitySeries(hours = 120, endTime = new Date()) {
  const { db } = await connectToDatabase();
  const collection = db.collection('waterQuality');

  const startTime = new Date(endTime.getTime() - hours * HOURS_TO_MS);
  const timeSeriesData = await collection
    .find({ scrape_timestamp: { $gte: startTime, $lte: endTime } })
    .sort({ scrape_timestamp: 1 })
    .toArray();

  return timeSeriesData
    .map((data) => {
      const rowTimestamp = data?.scrape_timestamp;
      const numberCSOsPerKm2 = Number(data?.water_quality?.number_CSOs_per_km2);

      if (!rowTimestamp || !Number.isFinite(numberCSOsPerKm2)) {
        return null;
      }

      return { timestamp: rowTimestamp, numberCSOsPerKm2 };
    })
    .filter(Boolean);
}

export async function getCsoDetailsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new HttpError(400, 'No valid ids provided');
  }

  const { db } = await connectToDatabase();
  const csoDataCollection = db.collection('csoData');

  const pipeline = [
    { $match: { 'attributes.Id': { $in: ids } } },
    { $group: { _id: '$attributes.Id', maxDate: { $max: '$DateScraped' } } },
    {
      $lookup: {
        from: 'csoData',
        let: { id: '$_id', d: '$maxDate' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$attributes.Id', '$$id'] }, { $eq: ['$DateScraped', '$$d'] }],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'doc',
      },
    },
    { $unwind: '$doc' },
  ];

  const results = await csoDataCollection.aggregate(pipeline, { allowDiskUse: true }).toArray();

  return results.reduce((response, row) => {
    const { attributes, geometry, DateScraped } = row.doc;
    response[attributes.Id] = {
      Id: attributes.Id,
      Status: attributes.Status,
      LatestEventStart: attributes.LatestEventStart,
      LatestEventEnd: attributes.LatestEventEnd,
      DateScraped,
      Coordinates: geometry ? { x: geometry.x, y: geometry.y } : undefined,
    };
    return response;
  }, {});
}

export async function getCsoDetailsById(id) {
  if (!id) {
    throw new HttpError(400, 'Missing id parameter');
  }

  const { db } = await connectToDatabase();
  const csoDataCollection = db.collection('csoData');

  const csoData = await csoDataCollection
    .find({ 'attributes.Id': id })
    .sort({ DateScraped: -1 })
    .limit(1)
    .next();

  if (!csoData) {
    throw new HttpError(404, 'CSO data not found');
  }

  const { attributes, geometry } = csoData;
  return {
    Id: attributes.Id,
    Status: attributes.Status,
    LatestEventStart: attributes.LatestEventStart,
    LatestEventEnd: attributes.LatestEventEnd,
    DateScraped: csoData.DateScraped,
    Coordinates: geometry ? { x: geometry.x, y: geometry.y } : undefined,
  };
}
