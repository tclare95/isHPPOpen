// The predictor forecast's indicative confidence band, shared by the forecast chart and the homepage
// current-conditions summary so both show the same range. Pure and client-safe.

/**
 * The mean absolute error for a forecast horizon, interpolated between the published accuracy horizons
 * (extrapolated from the last two beyond the end). Null when there is no usable accuracy data.
 */
export const getErrorForHorizon = (horizonHours, accuracyData) => {
  if (!accuracyData || accuracyData.length === 0) {
    return null;
  }

  const sorted = [...accuracyData]
    .filter((d) => d.mae !== null && d.mae !== undefined)
    .sort((a, b) => a.horizon_hours - b.horizon_hours);

  if (sorted.length === 0) return null;

  let lower = null;
  let upper = null;

  for (const point of sorted) {
    if (point.horizon_hours <= horizonHours) {
      lower = point;
    }
    if (point.horizon_hours >= horizonHours && !upper) {
      upper = point;
    }
  }

  if (!lower && upper) {
    return upper.mae;
  }

  if (lower && !upper) {
    if (sorted.length >= 2) {
      const secondLast = sorted[sorted.length - 2];
      const last = sorted[sorted.length - 1];
      const slope = (last.mae - secondLast.mae) / (last.horizon_hours - secondLast.horizon_hours);
      return last.mae + slope * (horizonHours - last.horizon_hours);
    }
    return lower.mae;
  }

  if (lower.horizon_hours === horizonHours) {
    return lower.mae;
  }

  const ratio = (horizonHours - lower.horizon_hours) / (upper.horizon_hours - lower.horizon_hours);
  return lower.mae + ratio * (upper.mae - lower.mae);
};

/**
 * Widens the band modestly when recent forecast runs disagree: 1.0 when stability is 0 or unknown, up to
 * 1.5 when the stability standard deviation reaches the MAE.
 */
export const getStabilityFactor = (stabilityStd, mae) => {
  if (stabilityStd === null || stabilityStd === undefined || mae === null || mae === undefined || mae === 0) {
    return 1;
  }
  const factor = 1 + 0.5 * (stabilityStd / mae);
  return Math.min(1.5, Math.max(1, factor));
};

/** Stability per row, smoothed with a centred moving average (window of 5) to avoid a jagged band. */
export function smoothStability(forecastRows) {
  return forecastRows.map((_row, index) => {
    const halfWindow = 2;
    const values = forecastRows
      .slice(Math.max(0, index - halfWindow), Math.min(forecastRows.length, index + halfWindow + 1))
      .map((row) => row.stability_std)
      .filter((value) => value !== null && value !== undefined);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  });
}

/**
 * `{ low, high }` (~95%: 1.96 × MAE, scaled by stability) for every forecast row, or `{ low: null, high: null }`
 * where no accuracy data applies. Horizons are measured from the first forecast row, as the chart always has.
 */
export function getForecastIntervals(forecastRows, accuracyData) {
  const startTime = forecastRows.length ? Date.parse(forecastRows[0].forecast_date) : null;
  const smoothed = smoothStability(forecastRows);
  return forecastRows.map((row, index) => {
    const horizonHours = (Date.parse(row.forecast_date) - startTime) / (1000 * 60 * 60);
    const errorMargin = Number.isFinite(horizonHours) ? getErrorForHorizon(horizonHours, accuracyData) : null;
    if (errorMargin === null || !Number.isFinite(errorMargin)) return { low: null, high: null };
    const interval = errorMargin * 1.96 * getStabilityFactor(smoothed[index], errorMargin);
    return { low: row.forecast_reading - interval, high: row.forecast_reading + interval };
  });
}
