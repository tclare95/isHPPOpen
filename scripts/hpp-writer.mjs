// openIndicator writer handover for the HPP status service (#89).
//
//   npm run hpp:writer -- status
//       Read-only: control, app-writer verdict, latest openIndicator record,
//       authoritative and shadow state.
//   npm run hpp:writer -- to-app --expect-latest <openIndicator _id> [--apply]
//       Reconcile and hand openIndicator to the app. Refuses unless the
//       latest record is the one named, and shadow is fresh, not holding and
//       agrees with it. The app writes only after the scraper acknowledges.
//   npm run hpp:writer -- to-legacy [--apply]
//       Rollback: hand openIndicator back to the scraper. The app stops at
//       its next run; the scraper resumes after the 5-minute fence.
//
// Without --apply nothing is written; the plan is printed. --apply is a
// production data change and needs the cutover decision recorded on #89.
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { applyHandover } from "../libs/hpp/hppAuthoritativeStore.js";
import { createHppAuthoritativeService } from "../libs/hpp/hppAuthoritativeService.js";
import { HPP_RULE_V1 } from "../libs/hpp/hppDecision.js";
import { planHandoverToApp, planHandoverToLegacy } from "../libs/hpp/hppHandover.js";
import { HPP_STATE_ID } from "../libs/hpp/hppHistory.js";
import { SHADOW_COLLECTIONS } from "../libs/hpp/hppShadowStore.js";

dotenv.config({ path: ".env.local", quiet: true });

const [command = "status", ...args] = process.argv.slice(2);
const apply = args.includes("--apply");
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const { MONGODB_URI: uri, MONGODB_DB: databaseName } = process.env;
if (!uri || !databaseName) {
  console.error("MONGODB_URI and MONGODB_DB are required.");
  process.exit(1);
}
if (!["status", "to-app", "to-legacy"].includes(command)) {
  console.error("Usage: hpp-writer.mjs status | to-app --expect-latest <id> [--apply] | to-legacy [--apply]");
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(databaseName);
  const now = new Date();
  // The RDP client is never needed here; the service is used only for its store and report.
  const service = createHppAuthoritativeService({ db, getClient: async () => { throw new Error("not used"); } });
  const shadowState = await db.collection(SHADOW_COLLECTIONS.state).findOne({ _id: HPP_STATE_ID });
  const writer = await service.writerReport({ now });

  if (command === "status") {
    const health = shadowState?.health ?? {};
    console.log(JSON.stringify({
      generatedAt: now.toISOString(),
      owner: writer.control?.owner ?? "legacy (no control document)",
      ...writer,
      shadow: shadowState && { open: shadowState.open, basisAt: shadowState.basisAt, sequence: shadowState.sequence,
        lastEligibleAt: health.lastEligibleAt ?? null, holdSince: health.holdSince ?? null, holdReason: health.holdReason ?? null },
    }, null, 2));
  } else {
    const control = writer.control;
    const plan = command === "to-app"
      ? planHandoverToApp({
        control,
        latest: await service.store.latestOpenIndicator(),
        expectLatestId: option("--expect-latest"),
        shadowState,
        authoritativeState: await service.store.loadState(),
        maxAppSequence: await service.store.maxAppSequence(HPP_RULE_V1.ruleId),
        rule: HPP_RULE_V1,
        now,
      })
      : planHandoverToLegacy({ control, now });

    console.log(JSON.stringify({ command, apply, plan }, null, 2));
    if (!plan.ok) {
      process.exitCode = 2;
    } else if (apply) {
      const result = await applyHandover(db, plan);
      console.log(JSON.stringify({ result }, null, 2));
      if (!result.applied) process.exitCode = 3;
    } else {
      console.log("Dry run: nothing written. Re-run with --apply after the cutover decision is recorded on #89.");
    }
  }
} finally {
  await client.close();
}
