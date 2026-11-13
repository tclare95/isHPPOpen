// Read-only HPP shadow evidence export (#89).
//
// Prints the same report as /api/admin/hpp-shadow, built directly from Mongo,
// for operators without a browser session or for attaching to #89.
// Performs reads only (findOne, find, countDocuments); it never writes.
//
//   npm run hpp:shadow-report             # full JSON report
//   npm run hpp:shadow-report -- --summary # acceptance checks only
//   npm run hpp:shadow-report -- --csv     # acceptance timeline CSV
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { acceptanceToCsv } from "../libs/hpp/hppAcceptance.js";
import { HPP_RULE_V1 } from "../libs/hpp/hppDecision.js";
import { buildShadowReport } from "../libs/hpp/hppHistory.js";
import { createMongoShadowStore } from "../libs/hpp/hppShadowStore.js";

dotenv.config({ path: ".env.local", quiet: true });

const { MONGODB_URI: uri, MONGODB_DB: databaseName } = process.env;
if (!uri || !databaseName) {
  console.error("MONGODB_URI and MONGODB_DB are required (read-only access is sufficient).");
  process.exit(1);
}

const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
try {
  await client.connect();
  const store = createMongoShadowStore(client.db(databaseName));
  const now = new Date();
  const [state, transitions, legacyRecords, legacySummary] = await Promise.all([
    store.loadState(),
    store.listTransitions(HPP_RULE_V1.ruleId),
    store.readLegacyHistory(now),
    store.legacySummary(),
  ]);
  const report = buildShadowReport({ state, transitions, legacyRecords, legacySummary, now });
  if (process.argv.includes("--csv")) {
    process.stdout.write(report.acceptance ? acceptanceToCsv(report.acceptance) : "");
  } else if (process.argv.includes("--summary")) {
    const { ready, blocking, checks, window } = report.acceptance ?? {};
    console.log(JSON.stringify({ status: report.status, generatedAt: report.generatedAt, lastKnown: report.lastKnown,
      evidence: report.evidence, ready, blocking, window, checks }, null, 2));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  await client.close();
}
