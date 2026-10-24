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
