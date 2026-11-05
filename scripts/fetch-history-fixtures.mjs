#!/usr/bin/env node
// Development aid for the /history explorer (#104). Downloads public EA Hydrology
// Colwick 15-minute qualified readings — the exact series RDP imported for
// 2016–2025 (#50) — into a local, gitignored folder in RDP observation-row shape,
// one JSON file per UTC calendar year.
//
// The RDP read API needs Vercel OIDC federation and cannot be called locally, so
// `HISTORY_DEV_FIXTURE_DIR=<dir> npm run dev` serves these files instead. They are
// development fixtures only: production always reads RDP. Never commit the output.
//
// Usage: node scripts/fetch-history-fixtures.mjs [--from 2016] [--to 2026]
//          [--out .history-fixtures] [--live-from 2026-10-08T00:00:00Z]
//
// --live-from imitates production: rows of the final year before that instant are
// omitted (not yet imported), later rows are relabelled as live flood-monitoring
// telemetry with no provider quality (provisional).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const MEASURE = "0dcf81cb-5305-4e0b-b150-9b733ac44d0b-level-i-900-m-qualified";
const HYDROLOGY = `https://environment.data.gov.uk/hydrology/id/measures/${MEASURE}`;
const PROVIDER_MEASURE_ID = "4009-level-stage-i-15_min-mASD";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const fromYear = Number(arg("from", "2016"));
const toYear = Number(arg("to", String(new Date().getUTCFullYear())));
const outDir = path.resolve(arg("out", ".history-fixtures"));
const liveFrom = arg("live-from", null);
const liveFromMs = liveFrom ? Date.parse(liveFrom) : null;

// Hydrology dateTime values are UTC without an offset; never let them parse as local time.
const utc = (value) => (/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);

function toRow(item) {
  const observedAt = new Date(utc(item.dateTime)).toISOString().replace(/\.000Z$/, "Z");
  const quality = item.qcode
    ? JSON.stringify({ qcode: item.qcode, quality: item.quality })
    : JSON.stringify({ quality: item.quality });
  return {
    observedAt, value: Number(item.value), unit: "mASD", datum: "ASD", quality,
    sourceId: "ea-flood-monitoring", providerMeasureId: PROVIDER_MEASURE_ID,
    ingestedAt: "2026-11-03T00:00:00Z", sourceReference: `${HYDROLOGY}`, revision: 1,
  };
}

function toLiveRow(row) {
  return {
    ...row, quality: null,
    sourceReference: `http://environment.data.gov.uk/flood-monitoring/data/readings/${PROVIDER_MEASURE_ID}/${row.observedAt}`,
  };
}

await mkdir(outDir, { recursive: true });
for (let year = fromYear; year <= toYear; year++) {
  const url = `${HYDROLOGY}/readings.json?mineq-date=${year}-01-01&max-date=${year + 1}-01-01&_limit=40000`;
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "ishppopen-history-fixtures" } });
  if (!response.ok) throw new Error(`Hydrology ${year}: HTTP ${response.status}`);
  const items = (await response.json()).items ?? [];
  let rows = items
    .filter((item) => item.value !== undefined && item.value !== null && Number.isFinite(Number(item.value)))
    .map(toRow)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  if (liveFromMs !== null && year === toYear) {
    rows = rows.filter((row) => Date.parse(row.observedAt) >= liveFromMs).map(toLiveRow);
  }
  await writeFile(path.join(outDir, `ea-colwick-level-${year}.json`), JSON.stringify(rows));
  console.log(`${year}: ${rows.length} rows (${items.length} source items)`);
  await delay(1000);
}
