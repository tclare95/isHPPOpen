import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env.local' });

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const percentile = (values, p) => values[Math.floor((values.length - 1) * p)];
const round = (value) => Number(value.toPrecision(3));
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;
if (!uri || !databaseName) throw new Error('MONGODB_URI and MONGODB_DB are required');

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(databaseName);
  const latest = await db.collection('waterQuality').find().sort({ scrape_timestamp: -1 }).limit(1).next();
  if (!latest?.scrape_timestamp) throw new Error('No water-quality history found');
  const end = new Date(latest.scrape_timestamp);
  const start = new Date(end.getTime() - 365 * DAY_MS);
  const densityRows = await db.collection('waterQuality').find(
    { scrape_timestamp: { $gte: start, $lte: end } },
    { projection: { scrape_timestamp: 1, 'water_quality.number_CSOs_per_km2': 1 } }
  ).sort({ scrape_timestamp: 1 }).toArray();
  const rollingMeans = [];
  for (let index = 0, left = 0; index < densityRows.length; index += 1) {
    const currentTime = new Date(densityRows[index].scrape_timestamp).getTime();
    while (new Date(densityRows[left].scrape_timestamp).getTime() < currentTime - 3 * HOUR_MS) left += 1;
    const values = densityRows.slice(left, index + 1).map((row) => Number(row.water_quality?.number_CSOs_per_km2)).filter(Number.isFinite);
    if (values.length >= 8) rollingMeans.push(values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  rollingMeans.sort((a, b) => a - b);

  const levelDocs = await db.collection('riverschemas').find(
    { model_date: { $gte: start, $lte: end } },
    { projection: { model_date: 1, level_readings: { $slice: 1 } } }
  ).sort({ model_date: 1 }).toArray();
  const levels = [...new Map(levelDocs.map((doc) => {
    const reading = doc.level_readings?.[0];
    return [reading?.reading_date, reading];
  }).filter(([key, row]) => key && Number.isFinite(Number(row?.reading_level)))).values()]
    .sort((a, b) => new Date(a.reading_date) - new Date(b.reading_date));
  const rises = [];
  let earlierIndex = 0;
  for (let index = 0; index < levels.length; index += 1) {
    const target = new Date(levels[index].reading_date).getTime() - 4 * HOUR_MS;
    while (earlierIndex + 1 < index) {
      const currentDistance = Math.abs(new Date(levels[earlierIndex].reading_date).getTime() - target);
      const nextDistance = Math.abs(new Date(levels[earlierIndex + 1].reading_date).getTime() - target);
      if (nextDistance > currentDistance) break;
      earlierIndex += 1;
    }
    const earlier = levels[earlierIndex];
    const distance = earlier ? Math.abs(new Date(earlier.reading_date).getTime() - target) : Infinity;
    if (distance <= 30 * 60 * 1000) {
      const rise = Number(levels[index].reading_level) - Number(earlier.reading_level);
      if (rise > 0) rises.push(rise);
    }
  }
  rises.sort((a, b) => a - b);
  console.log(JSON.stringify({
    version: end.toISOString().slice(0, 10),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    waterQuality: { sampleCount: rollingMeans.length, elevatedDensity: round(percentile(rollingMeans, 0.60)), highDensity: round(percentile(rollingMeans, 0.80)) },
    runoff: { sampleCount: rises.length, elevatedRiseMetres: round(percentile(rises, 0.75)), highRiseMetres: round(percentile(rises, 0.90)) },
  }, null, 2));
} finally {
  await client.close();
}
