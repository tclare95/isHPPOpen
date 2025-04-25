import React from "react";

// Traffic‑light thresholds for CSO density (per km² per hour)
const CSO_THRESHOLDS = {
  GREEN_MAX: 0.003,
  AMBER_MAX: 0.010,
  RED_MAX: 0.025,
  BLACK_MIN: 0.025,
};

// Helper to calculate mean of an array
const calculateMean = (values) =>
  values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;

// Helper to determine long-term change rate
const getLongChangeRate = (levelData, currentLevel) => {
  const change24h = levelData[0].reading_level - (levelData[96]?.reading_level ?? currentLevel);
  const change48h = levelData[0].reading_level - (levelData[192]?.reading_level ?? currentLevel);

  if (change24h > 0.3 || change48h > 0.25) return "danger";
  if (change24h > 0.1 || change48h > 0.1) return "warning";
  return "safe";
};

// Helper to calculate severity based on thresholds
const getSeverity = (value, thresholds) => {
  if (value >= thresholds.RED_MAX) return 2; // red
  if (value >= thresholds.AMBER_MAX) return 1; // amber
  return 0; // green
};

export default function VomitFactor({ levelData = [], csoData = [] }) {
  if (!levelData.length) return null;

  const currentLevel = levelData[0].reading_level;

  // Short-term 4-hour mean rate of change
  const changeRate =
    calculateMean([
      levelData[0]?.reading_level - levelData[4]?.reading_level ?? 0,
      levelData[4]?.reading_level - levelData[8]?.reading_level ?? 0,
      levelData[8]?.reading_level - levelData[12]?.reading_level ?? 0,
      levelData[12]?.reading_level - levelData[16]?.reading_level ?? 0,
    ]);

  // River level severity
  const longChangeRate = getLongChangeRate(levelData, currentLevel);
  const levelSeverity =
    currentLevel >= 1.5 || changeRate > 0.3 || longChangeRate === "danger"
      ? 2
      : currentLevel >= 1.3 || changeRate > 0.05 || longChangeRate === "warning"
      ? 1
      : 0;

  // CSO severity
  const recentCSOData = csoData
    .slice(0, 3)
    .map((d) => d?.numberCSOsPerKm2)
    .filter((v) => typeof v === "number" && !isNaN(v));

  const csoMean = calculateMean(recentCSOData);
  const csoSeverity = recentCSOData.length
    ? getSeverity(csoMean, CSO_THRESHOLDS) ||
      (recentCSOData[0] >= 0.017 ? 2 : 0) // Extreme spike check
    : 0;

  // Combine severities
  const worstSeverity = Math.max(levelSeverity, csoSeverity);

  // Circle class based on severity
  const circleClass = `align-middle rounded-circle d-inline-block circle ml-2 mt-2 ${
    worstSeverity === 2
      ? "bg-danger"
      : worstSeverity === 1
      ? "bg-warning"
      : "bg-success"
  }`;

  // Tooltip text
  const tooltip = `River Δ4h: ${changeRate.toFixed(2)} m | ${
    csoData.length
      ? `CSO 3‑h mean: ${(csoMean * 1e3).toFixed(2)}×10⁻³`
      : "CSO: n/a"
  }`;

  return (
    <div
      className={circleClass}
      data-toggle="tooltip"
      data-placement="top"
      title={`Water Quality Indicator – ${tooltip}`}
    ></div>
  );
}