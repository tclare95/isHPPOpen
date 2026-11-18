// Client-safe presentation of the predictor forecast (/api/s3forecast) next to observed levels. Shared by the homepage
// chart and /forecastinfo so both pages say the same thing when the forecast is missing, failed or out of date.

import { formatReadingAge } from "./hpp/hppHomeStatus.js";

// The forecast's own freshness window (forecastService health uses the same one hour).
export const FORECAST_STALE_MS = 60 * 60 * 1000;

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

/**
 * `{ rows, notice }` for the forecast. `rows` are the forecast rows to chart; `notice` is null for a usable, recent
 * forecast, or the words to show when it is unavailable or out of date. A failed refresh keeps the last forecast that
 * was loaded (SWR keeps it), judged by its own run time. A forecast with an unreadable run time is treated as out of
 * date, never as current.
 */
export function describeForecast(forecast, now = new Date()) {
  const rows = Array.isArray(forecast?.forecast_data) ? forecast.forecast_data : [];
  if (!rows.length) {
    return { rows: [], notice: "The forecast is unavailable right now, so only observed levels are shown." };
  }

  const generatedAt = toDate(forecast?.metadata?.forecast_time ?? rows[0]?.forecast_time ?? forecast?.health?.generatedAt);
  if (!generatedAt) {
    return { rows, notice: "The time this forecast was made is unknown, so it may be out of date." };
  }

  if (now.getTime() - generatedAt.getTime() > FORECAST_STALE_MS) {
    return { rows, notice: `This forecast was made ${formatReadingAge(generatedAt, now)} ago, so it may be out of date.` };
  }

  return { rows, notice: null };
}
