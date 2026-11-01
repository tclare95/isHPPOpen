// Verify or provision indexes the scheduled alert evaluator relies on (#47).
// The evaluator only *checks* the unique delivery index at runtime; it never creates it.
// Default is a dry run. Use --apply only with explicit approval for the target database.
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB;
const indexes = [
  // Same key/options the evaluator previously created on every run, so existing deployments already match.
  { collection: 'alertDeliveries', key: { alertKey: 1, transitionId: 1 }, options: { unique: true } },
];

if (!uri || !databaseName) {
  if (apply) throw new Error('MONGODB_URI and MONGODB_DB are required');
  console.log(JSON.stringify({ dryRun: true, indexes }, null, 2));
  console.log('No database connection configured; nothing checked or changed.');
  process.exit(0);
}

const client = new MongoClient(uri);
const sameKey = (left, right) => JSON.stringify(Object.entries(left)) === JSON.stringify(Object.entries(right));
let problems = 0;

try {
  await client.connect();
  const db = client.db(databaseName);
  for (const index of indexes) {
    const collection = db.collection(index.collection);
    const existing = (await collection.listIndexes().toArray().catch(() => [])).find((candidate) => sameKey(candidate.key, index.key));
    if (existing && Boolean(existing.unique) === Boolean(index.options.unique)) {
      console.log(`${index.collection}: ok (${existing.name})`);
      continue;
    }
    if (existing) {
      problems += 1;
      console.log(`${index.collection}: ${existing.name} exists without the required unique option; resolve manually.`);
      continue;
    }
    if (!apply) {
      problems += 1;
      console.log(`${index.collection}: missing ${JSON.stringify(index.key)} ${JSON.stringify(index.options)} (dry run; re-run with --apply after approval)`);
      continue;
    }
    const name = await collection.createIndex(index.key, index.options);
    console.log(`${index.collection}: created ${name}`);
  }
} finally {
  await client.close();
}

process.exitCode = problems ? 1 : 0;
