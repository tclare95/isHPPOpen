import "server-only";
import { buildMeasureSnapshot } from "../services/trentWeirsService";
import { isSeriesFresh } from "./trentSeries.js";

const MAX_MISMATCH_SAMPLES = 3;

// Equal within binary representation of the same source decimal; no tolerance beyond that.
function sameValue(a, b) {
  return Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function byTime(readings) {
  return new Map(readings.map((reading) => [Date.parse(reading.dateTime), reading.value]));
}

function freshness(readings, now) {
  return readings?.length ? (isSeriesFresh(readings, now) ? "fresh" : "stale") : "missing";
}

// Compares one series by exact observed timestamp. Retrieval times never count as conflicts;
// newest-observation lag, gaps inside the overlapping window and derived rates are separate facts.
export function compareTrentSeries({ key, measureType, legacyReadings = [], rdpReadings = [], rdpError = null, now = new Date() }) {
  const report = {
    key,
    status: "match",
    legacyState: freshness(legacyReadings, now),
    rdpState: rdpError ? "error" : freshness(rdpReadings, now),
    rdpError,
    matched: 0,
    valueMismatches: 0,
    mismatchSamples: [],
    missingInRdp: 0,
    missingInLegacy: 0,
    legacyNewest: legacyReadings[0]?.dateTime ?? null,
    rdpNewest: rdpReadings[0]?.dateTime ?? null,
    latestLagSeconds: null,
    rates: null,
  };

  if (rdpError) return { ...report, status: "rdp_error" };
  if (!legacyReadings.length || !rdpReadings.length) {
    return { ...report, status: legacyReadings.length ? "rdp_missing" : "legacy_missing" };
  }

  const legacy = byTime(legacyReadings);
  const rdp = byTime(rdpReadings);
  const overlapStart = Math.max(Math.min(...legacy.keys()), Math.min(...rdp.keys()));
  const overlapEnd = Math.min(Math.max(...legacy.keys()), Math.max(...rdp.keys()));
  const inOverlap = (time) => time >= overlapStart && time <= overlapEnd;

  for (const [time, value] of legacy) {
    if (!rdp.has(time)) {
      if (inOverlap(time)) report.missingInRdp++;
      continue;
    }
    report.matched++;
    if (!sameValue(value, rdp.get(time))) {
      report.valueMismatches++;
      if (report.mismatchSamples.length < MAX_MISMATCH_SAMPLES) {
        report.mismatchSamples.push({ dateTime: new Date(time).toISOString(), legacy: value, rdp: rdp.get(time) });
      }
    }
  }
  for (const time of rdp.keys()) {
    if (!legacy.has(time) && inOverlap(time)) report.missingInLegacy++;
  }

  // Positive lag: RDP's newest observation is behind legacy's.
  report.latestLagSeconds = Math.round((Date.parse(report.legacyNewest) - Date.parse(report.rdpNewest)) / 1000);

  const legacySnapshot = buildMeasureSnapshot(legacyReadings, measureType);
  const rdpSnapshot = buildMeasureSnapshot(rdpReadings, measureType);
  report.rates = {
    legacyHour: legacySnapshot.rateOfChangeHour, rdpHour: rdpSnapshot.rateOfChangeHour,
    legacyDay: legacySnapshot.rateOfChangeDay, rdpDay: rdpSnapshot.rateOfChangeDay,
    match: legacySnapshot.rateOfChangeHour === rdpSnapshot.rateOfChangeHour &&
      legacySnapshot.rateOfChangeDay === rdpSnapshot.rateOfChangeDay,
  };

  report.status = report.valueMismatches > 0 ? "value_mismatch" :
    report.matched === 0 ? "no_overlap" :
    report.missingInRdp > 0 || report.missingInLegacy > 0 ? "gaps" :
    !report.rates.match || report.latestLagSeconds !== 0 ? "lag" : "match";
  return report;
}
