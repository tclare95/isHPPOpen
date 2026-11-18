/**
 * Indicative forecast range for the Colwick predictor, from the errors of forecasts actually published.
 *
 * Source: trent-predictor `python -m evaluation.run` (EVALUATION.md), tier `as_issued`, model
 * xgb_colwick_horizon@2026-03-22, runs issued 2026-03-22 to 2026-11-17. Each offset pair is the 10th/90th
 * percentile of (observed - forecast) at that lead time, so the band is asymmetric (forecasts in this period ran
 * slightly high on average, but in rapid rises the observed level usually ended above the band).
 *
 * What it does and does not mean (measured, not assumed):
 * - Out of sample (fitted on Mar-Jul, tested on Jul-Nov) about 70% of outcomes fell inside, not 80%.
 * - During rapid rises only about 35-55% fell inside; misses were almost all above the band.
 * - The period had no levels above 2.2 m, so the range is untested in flood conditions.
 * It is an indicative range, not a confidence interval. Regenerate it whenever the production model changes.
 */
export const FORECAST_RANGE = {
  model: "xgb_colwick_horizon@2026-03-22",
  period: { start: "2026-03-22", end: "2026-11-17" },
  measuredCoverage: 0.7,
  // horizon_hours: model lead from the forecast's data time; lower/upper: metres added to the forecast
  points: [
    { horizon_hours: 1, lower: -0.056, upper: 0.031 },
    { horizon_hours: 2, lower: -0.064, upper: 0.038 },
    { horizon_hours: 3, lower: -0.066, upper: 0.038 },
    { horizon_hours: 6, lower: -0.065, upper: 0.044 },
    { horizon_hours: 8, lower: -0.067, upper: 0.062 },
    { horizon_hours: 12, lower: -0.074, upper: 0.049 },
    { horizon_hours: 18, lower: -0.095, upper: 0.053 },
    { horizon_hours: 24, lower: -0.092, upper: 0.053 },
    { horizon_hours: 36, lower: -0.114, upper: 0.06 },
    { horizon_hours: 48, lower: -0.128, upper: 0.059 },
    { horizon_hours: 60, lower: -0.136, upper: 0.059 },
    { horizon_hours: 72, lower: -0.147, upper: 0.063 },
  ],
};

export const FORECAST_RANGE_LABEL = "Show indicative range";

export const FORECAST_RANGE_DESCRIPTION =
  "Shaded band: about 7 in 10 past forecasts at the same lead time ended inside it (Mar–Nov 2026, published forecasts). " +
  "It is not a guarantee: it is too narrow when the river is rising quickly, and it has not been tested in flood conditions.";

/**
 * Offsets (metres) for a lead time, linearly interpolated; held at the first/last point outside the table.
 * @param {number} horizonHours lead from the forecast's data time
 * @returns {{lower: number, upper: number} | null}
 */
export function rangeOffsets(horizonHours, points = FORECAST_RANGE.points) {
  if (!Number.isFinite(horizonHours) || !points.length) return null;
  if (horizonHours <= points[0].horizon_hours) return { lower: points[0].lower, upper: points[0].upper };
  const last = points[points.length - 1];
  if (horizonHours >= last.horizon_hours) return { lower: last.lower, upper: last.upper };
  for (let i = 1; i < points.length; i += 1) {
    const hi = points[i];
    if (horizonHours <= hi.horizon_hours) {
      const lo = points[i - 1];
      const ratio = (horizonHours - lo.horizon_hours) / (hi.horizon_hours - lo.horizon_hours);
      return {
        lower: lo.lower + ratio * (hi.lower - lo.lower),
        upper: lo.upper + ratio * (hi.upper - lo.upper),
      };
    }
  }
  return null;
}
