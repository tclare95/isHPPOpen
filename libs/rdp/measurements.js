import "server-only";
import { RdpError } from "./errors.js";

// The three #52 IDs are reserved mappings, not a claim of backend publication.
export const RDP_MEASUREMENTS = Object.freeze({
  "4009-level": Object.freeze({ measurementId: "ea-colwick-level", stationId: "ea-colwick", parameter: "level", unit: "mASD", datum: "ASD", providerMeasureId: "4009-level-stage-i-15_min-mASD" }),
  "4126-level": Object.freeze({ measurementId: "ea-clifton-bridge-level", stationId: "ea-clifton-bridge", parameter: "level", unit: "mASD", datum: "ASD", providerMeasureId: "4126-level-stage-i-15_min-mASD" }),
  "4007-level": Object.freeze({ measurementId: "ea-shardlow-level", stationId: "ea-shardlow", parameter: "level", unit: "mASD", datum: "ASD", providerMeasureId: "4007-level-stage-i-15_min-mASD" }),
  "4067-level": Object.freeze({ measurementId: "ea-church-wilne-level", stationId: "ea-church-wilne", parameter: "level", unit: "mASD", datum: "ASD", providerMeasureId: "4067-level-stage-i-15_min-mASD" }),
  "4074-level": Object.freeze({ measurementId: "ea-kegworth-level", stationId: "ea-kegworth", parameter: "level", unit: "mASD", datum: "ASD", providerMeasureId: "4074-level-stage-i-15_min-mASD" }),
  "4007-flow": Object.freeze({ measurementId: "ea-shardlow-flow", stationId: "ea-shardlow", parameter: "flow", unit: "m3/s", datum: "unknown", providerMeasureId: "4007-flow--i-15_min-m3_s" }),
});

export function getRdpMeasurement(alias) {
  if (!Object.hasOwn(RDP_MEASUREMENTS, alias)) throw new RdpError("INVALID_MEASUREMENT");
  return RDP_MEASUREMENTS[alias];
}

export function getCanonicalMeasurement(id) {
  const measure = Object.values(RDP_MEASUREMENTS).find((item) => item.measurementId === id);
  if (!measure) throw new RdpError("INVALID_MEASUREMENT");
  return measure;
}

export function assertRdpCatalogueMeasurement(alias, catalogue) {
  const expected = getRdpMeasurement(alias);
  const matches = catalogue.filter((entry) => entry.measurementId === expected.measurementId);
  const entry = matches[0];
  if (matches.length !== 1 || entry.provider !== "environment-agency" ||
      entry.sourceId !== "ea-flood-monitoring" || entry.expectedIntervalSeconds !== 900 ||
      ["stationId", "parameter", "unit", "datum"].some((key) => entry[key] !== expected[key])) {
    throw new RdpError("MEASUREMENT_CONTRACT_ERROR");
  }
  return expected;
}

// Observed rainfall (RDP #54, isHPPOpen #53): the six trent-predictor rain gauges, published and collected by RDP
// production since 17 Nov 2026. 15-minute period totals in mm, never instantaneous readings. Kept apart from
// RDP_MEASUREMENTS so the level/flow lookups, envelopes and Trent station order are unchanged. `reference` is the
// EA flood-monitoring station; `area` is a coarse location only (EA anonymises rain gauge metadata).
const rainfall = (measurementId, name, reference, area) => Object.freeze({
  measurementId, name, reference, area, parameter: "rainfall", unit: "mm", periodSeconds: 900,
  providerMeasureId: `${reference}-rainfall-tipping_bucket_raingauge-t-15_min-mm`,
});
export const RDP_RAINFALL_MEASUREMENTS = Object.freeze([
  rainfall("ea-stone-rainfall", "Stone", "3014", "Upper Trent, Staffordshire"),
  rainfall("ea-lea-marston-rainfall", "Lea Marston", "3288", "River Tame, north Warwickshire"),
  rainfall("ea-ashbourne-rainfall", "Ashbourne", "3323", "Dove catchment, Derbyshire"),
  rainfall("ea-ashford-rainfall", "Ashford Hall", "3616", "Derwent catchment, Peak District"),
  rainfall("ea-wanlip-rainfall", "Wanlip", "3683", "River Soar, north of Leicester"),
  rainfall("ea-sutton-bonington-rainfall", "Sutton Bonington", "3652", "Lower Soar, near the Trent"),
]);

export function getRainfallMeasurement(id) {
  const measure = RDP_RAINFALL_MEASUREMENTS.find((item) => item.measurementId === id);
  if (!measure) throw new RdpError("INVALID_MEASUREMENT");
  return measure;
}
