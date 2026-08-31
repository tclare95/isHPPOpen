import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;
const indexes = [
  { collection: 'waterQuality', key: { scrape_timestamp: -1 }, name: 'water_quality_latest' },
  { collection: 'csoData', key: { 'attributes.Id': 1, DateScraped: -1 }, name: 'cso_id_latest' },
  { collection: 'csoData', key: { DateScraped: 1 }, name: 'cso_scraped_at' },
];

if (!apply) {
  console.log(JSON.stringify({ dryRun: true, indexes }, null, 2));
  console.log('No database changes made. Re-run with --apply after production approval.');
  process.exit(0);
}
if (!uri || !databaseName) throw new Error('MONGODB_URI and MONGODB_DB are required');

const client = new MongoClient(uri);
const sameKey = (left, right) => JSON.stringify(Object.entries(left)) === JSON.stringify(Object.entries(right));

try {
  await client.connect();
  const db = client.db(databaseName);
  for (const index of indexes) {
    const collection = db.collection(index.collection);
    const existing = (await collection.listIndexes().toArray()).find((candidate) => sameKey(candidate.key, index.key));
    if (existing) {
      console.log(`${index.collection}: existing ${existing.name}`);
      continue;
    }
    const result = await collection.createIndex(index.key, { name: index.name });
    console.log(`${index.collection}: created ${result}`);
  }
} finally {
  await client.close();
}
