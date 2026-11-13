// Read-only #51 activation review. Summarises the Trent, observed-levels and gauge-alert shadow lines
// already logged by a deployment and evaluates the documented gates. It never changes Vercel, AWS,
// Mongo or source modes, and never needs RDP credentials.
//
//   npm run rdp:shadow-review -- logs/*.jsonl                        # `vercel logs --json` exports
//   npm run rdp:shadow-review -- --fetch --since 2026-11-03T00:00:00Z [--until …] [--environment production]
//   npm run rdp:shadow-review -- --colwick-ea https://ishppopen.co.uk   # public RDP history vs direct EA
//
// --fetch runs the logged-in Vercel CLI in the linked project directory (or --cwd <dir>) in 3-hour
// windows, because one `vercel logs` query returns at most 50 rows. Exit code 1 means a gate failed.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  compareObservedWithEa, evaluateDisplayGate, evaluateGaugeShadow, summariseShadowRows, TRENT_SERIES_KEYS,
} from "../libs/rdp/shadowReview.js";

const WINDOW_MS = 3 * 60 * 60 * 1000;
const QUERIES = ["Trent shadow comparison", "levels shadow comparison", "gauge alert shadow comparison"];
const EA_COLWICK = "https://environment.data.gov.uk/flood-monitoring/id/measures/4009-level-stage-i-15_min-mASD/readings";

function parseArgs(argv) {
  const options = { files: [], environment: "production" };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = () => argv[++index];
    if (arg === "--fetch") options.fetch = true;
    else if (arg === "--since") options.since = value();
    else if (arg === "--until") options.until = value();
    else if (arg === "--environment") options.environment = value();
    else if (arg === "--cwd") options.cwd = value();
    else if (arg === "--colwick-ea") options.colwickEa = value();
    else options.files.push(arg);
  }
  return options;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim().startsWith("{")).map((line) => JSON.parse(line));
}

function fetchVercelRows({ since, until, environment, cwd }) {
  if (!since) throw new Error("--fetch needs --since");
  const rows = [];
  const end = until ? Date.parse(until) : Date.now();
  for (let start = Date.parse(since); start < end; start += WINDOW_MS) {
    const windowEnd = new Date(Math.min(start + WINDOW_MS, end)).toISOString();
    for (const query of QUERIES) {
      const result = spawnSync("vercel", ["logs", "--environment", environment, "--since", new Date(start).toISOString(),
        "--until", windowEnd, "--query", process.platform === "win32" ? `"${query}"` : query, "--limit", "1000", "--json"],
      { cwd, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, MSYS_NO_PATHCONV: "1" }, maxBuffer: 64 * 1024 * 1024 });
      if (result.status !== 0) throw new Error(`vercel logs failed for ${new Date(start).toISOString()} (${query})`);
      const batch = parseJsonLines(result.stdout);
      if (batch.length >= 50) console.error(`warning: ${batch.length} rows in one 3h window for "${query}"; results may be truncated`);
      rows.push(...batch);
    }
  }
  return rows;
}

async function colwickEaParity(origin) {
  const now = new Date();
  const month = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
  const history = await fetch(`${origin.replace(/\/$/, "")}/api/history/colwick/month?${month}`);
  if (!history.ok) return { status: "history_unavailable", httpStatus: history.status };
  const { data } = await history.json();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const ea = await fetch(`${EA_COLWICK}?_sorted&_limit=3000&since=${since}`);
  if (!ea.ok) return { status: "ea_unavailable", httpStatus: ea.status };
  return { measurementId: data?.measurement?.measurementId, requestAsOf: data?.source?.requestAsOf, ...compareObservedWithEa(data?.readings ?? [], (await ea.json()).items ?? []) };
}

const options = parseArgs(process.argv.slice(2));
const output = {};
let failed = false;

if (options.fetch || options.files.length) {
  const rows = options.fetch ? fetchVercelRows(options) : options.files.flatMap((file) => parseJsonLines(readFileSync(file, "utf8")));
  const summary = summariseShadowRows(rows);
  const gates = {
    trent: summary.trent.comparisons ? evaluateDisplayGate(summary.trent, TRENT_SERIES_KEYS) : { pass: false, blockers: ["no Trent shadow comparisons"], notes: [] },
    levels: summary.levels.comparisons ? evaluateDisplayGate(summary.levels, ["4009-level"]) : { pass: false, blockers: ["no levels shadow comparisons"], notes: [] },
    gaugeAlerts: summary.gauge.runs ? evaluateGaugeShadow(summary.gauge) : { pass: false, blockers: ["no gauge alert shadow runs"], notes: [] },
  };
  Object.assign(output, { summary, gates });
  failed = Object.values(gates).some((gate) => !gate.pass);
}

if (options.colwickEa) {
  output.colwickEa = await colwickEaParity(options.colwickEa);
  failed ||= output.colwickEa.status !== "match";
}

if (!Object.keys(output).length) {
  console.error("usage: rdp-shadow-review [--fetch --since ISO [--until ISO] [--environment production|preview] [--cwd dir]] [files.jsonl…] [--colwick-ea https://origin]");
  process.exitCode = 2;
} else {
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = failed ? 1 : 0;
}
