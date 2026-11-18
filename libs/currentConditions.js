// Homepage "conditions now and next 24 hours" summary (Wave C / C3). Pure and client-safe: no I/O.
//
// It only describes evidence the site already loads: the authoritative HPP status (/api/hppstatus), observed
// Colwick levels (/api/levels), the predictor forecast (/api/s3forecast, /api/forecastaccuracy) and the Trent
// gauges (/api/trentweirs). It never decides HPP open/closed from a level or a forecast, never puts gauges on a
// shared height scale, and never turns missing or incomplete readings into a number or a trend.

import { HPP_THRESHOLD_METRES } from "./hpp/hppHomeStatus.js";
import { describeForecast } from "./forecastDisplay.js";
import { getForecastIntervals } from "./forecastConfidence.js";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "./trentWeirsConfig.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Recent movement is judged over the two hours before the latest reading.
export const TREND_WINDOW_MS = 2 * HOUR_MS;
// The reading used as the start of the window must be within this of the window start.
export const TREND_START_TOLERANCE_MS = 20 * MINUTE_MS;
// A gap longer than this between readings inside the window makes the movement unknown.
export const TREND_MAX_GAP_MS = 45 * MINUTE_MS;
// Changes smaller than this (in the measure's own units: 2 cm of level, 2 m³/s of flow) are "steady".
export const STEADY_LEVEL_METRES = 0.02;
export const STEADY_FLOW_CUMECS = 2;
// A visible "may be out of date" warning on an observed reading. EA publication typically lags 20–30 minutes,
// so this matches the homepage's existing two-hour notice; the age itself is always shown.
export const READING_STALE_NOTICE_MS = 2 * HOUR_MS;
// The coming-day forecast window.
export const NEXT_DAY_MS = 24 * HOUR_MS;
// A predicted change smaller than this over the next day is "about the same".
export const FORECAST_STEADY_METRES = 0.03;

const toDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** `[{ at: Date, value }]`, newest first, keeping only finite values with readable times. */
export function toSeries(items, { timeKey, valueKey }) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({ at: toDate(item?.[timeKey]), value: typeof item?.[valueKey] === "number" ? item[valueKey] : NaN }))
    .filter((point) => point.at && Number.isFinite(point.value))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const levelSeriesFrom = (levelData) => toSeries(levelData?.level_data, { timeKey: "reading_date", valueKey: "reading_level" });
export const gaugeSeriesFrom = (measureSnapshot) => toSeries(measureSnapshot?.readings, { timeKey: "dateTime", valueKey: "value" });

/**
 * Recent movement over `TREND_WINDOW_MS` before the latest reading:
 * `{ state: "rising" | "falling" | "steady", change, windowMs }` or `{ state: "unknown", reason }`.
 * It is unknown, never steady, when there is no reading near the start of the window or a gap inside it.
 */
export function describeTrend(series, { measureType = "level" } = {}) {
  if (!series.length) return { state: "unknown", reason: "no-readings" };
  const latest = series[0];
  const windowStart = latest.at.getTime() - TREND_WINDOW_MS;
  const inWindow = series.filter((point) => point.at.getTime() >= windowStart - TREND_START_TOLERANCE_MS);
  const start = inWindow[inWindow.length - 1];
  if (!start || start === latest || Math.abs(start.at.getTime() - windowStart) > TREND_START_TOLERANCE_MS) {
    return { state: "unknown", reason: "incomplete" };
  }
  for (let index = 1; index < inWindow.length; index += 1) {
    if (inWindow[index - 1].at.getTime() - inWindow[index].at.getTime() > TREND_MAX_GAP_MS) {
      return { state: "unknown", reason: "incomplete" };
    }
  }

  const change = latest.value - start.value;
  const steady = measureType === "flow" ? STEADY_FLOW_CUMECS : STEADY_LEVEL_METRES;
  const state = change > steady ? "rising" : change < -steady ? "falling" : "steady";
  return { state, change, windowMs: latest.at.getTime() - start.at.getTime() };
}

/** "3 cm" / "12.4 m³/s": a change in the measure's own units, without a sign. */
export function formatChange(change, measureType = "level") {
  return measureType === "flow" ? `${Math.abs(change).toFixed(1)} m³/s` : `${Math.round(Math.abs(change) * 100)} cm`;
}

/**
 * "Rising 4 cm over 2 hours", "Steady over 2 hours" or "Recent movement unknown …". The period ends at the latest
 * reading (whose age is shown next to it), not at the current time.
 */
export function formatTrend(trend, measureType = "level") {
  if (trend.state === "unknown") {
    return trend.reason === "no-readings"
      ? "Recent movement unknown"
      : "Recent movement unknown: recent readings are incomplete";
  }
  const hours = Math.max(1, Math.round(trend.windowMs / HOUR_MS));
  const period = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (trend.state === "steady") return `Steady over ${period}`;
  return `${trend.state === "rising" ? "Rising" : "Falling"} ${formatChange(trend.change, measureType)} over ${period}`;
}

/** "fresh" when the reading is recent enough to show without a warning, otherwise "stale". */
export function readingNoticeState(observedAt, now) {
  return now.getTime() - observedAt.getTime() >= READING_STALE_NOTICE_MS ? "stale" : "fresh";
}

/** The relation of a fresh-or-stale Colwick reading to the 2.2 m guide level. Never a status. */
export function describeGuideLevel(level) {
  return level >= HPP_THRESHOLD_METRES ? "at-or-above" : "below";
}

/**
 * The predictor forecast for the coming day, or `{ state: "unavailable" | "no-coverage", notice }`.
 *
 * `{ state: "available", madeAt, notice, direction, change, peak, low, endsAt, guide }`:
 * - `direction`: "rise" | "fall" | "steady", from the first to the last forecast point in the next 24 hours;
 * - `peak` / `low`: `{ value, at, rangeLow, rangeHigh }` (range null without accuracy data);
 * - `guide`: whether the predicted level (or only the upper end of its range) reaches 2.2 m, or falls below it.
 *   This is predicted conditions only, never a future HPP decision.
 */
export function describeNextDayForecast(forecastPayload, accuracyData, now = new Date(), { recordedStatus } = {}) {
  const { rows, notice } = describeForecast(forecastPayload, now);
  if (!rows.length) return { state: "unavailable", notice };

  const intervals = Array.isArray(accuracyData) && accuracyData.length
    ? getForecastIntervals(rows, accuracyData)
    : rows.map(() => ({ low: null, high: null }));
  const end = now.getTime() + NEXT_DAY_MS;
  const upcoming = rows
    .map((row, index) => ({ at: toDate(row.forecast_date), value: row.forecast_reading, ...intervals[index] }))
    .filter((point) => point.at && Number.isFinite(point.value) && point.at.getTime() > now.getTime() && point.at.getTime() <= end)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (!upcoming.length) return { state: "no-coverage", notice };

  const point = ({ value, at, low, high }) => ({
    value,
    at,
    rangeLow: Number.isFinite(low) ? low : null,
    rangeHigh: Number.isFinite(high) ? high : null,
  });
  const peak = point(upcoming.reduce((best, item) => (item.value > best.value ? item : best)));
  const low = point(upcoming.reduce((best, item) => (item.value < best.value ? item : best)));
  const first = upcoming[0];
  const last = upcoming[upcoming.length - 1];
  const change = last.value - first.value;
  const direction = change > FORECAST_STEADY_METRES ? "rise" : change < -FORECAST_STEADY_METRES ? "fall" : "steady";
  const rangeReaches = upcoming.some((item) => Number.isFinite(item.high) && item.high >= HPP_THRESHOLD_METRES);

  let guide = null;
  if (peak.value >= HPP_THRESHOLD_METRES) {
    guide = "predicted-at-or-above";
  } else if (rangeReaches) {
    guide = "range-reaches";
  }
  if (recordedStatus === "closed" && low.value < HPP_THRESHOLD_METRES) {
    guide = "predicted-below";
  }

  const madeAt = toDate(forecastPayload?.metadata?.forecast_time ?? rows[0]?.forecast_time ?? forecastPayload?.health?.generatedAt);
  return { state: "available", madeAt, notice, direction, change, peak, low, endsAt: last.at, guide };
}

/** The nearby gauges shown in the summary: every Trent dashboard gauge except Colwick, which is shown separately. */
export const NEARBY_GAUGES = TRENT_DASHBOARD_STATIONS.filter((station) => station.stationId !== 4009);

/** How each measure is labelled. Every level is metres above that gauge's own local datum. */
export function describeMeasureUnits(measureType) {
  return measureType === "flow"
    ? { unit: "m³/s", reference: "flow" }
    : { unit: "m", reference: "above this gauge's own datum" };
}

/**
 * One row per nearby gauge from an `/api/trentweirs` payload:
 * `{ key, name, measureType, unit, reference, latest: { value, at } | null, trend }`.
 * A gauge missing from the payload is listed with `latest: null`, never with another gauge's value.
 */
export function describeNearbyGauges(trentData) {
  const stations = Array.isArray(trentData?.stations) ? trentData.stations : [];
  return NEARBY_GAUGES.map((gauge) => {
    const station = stations.find((item) => item?.stationId === gauge.stationId);
    const series = gaugeSeriesFrom(station?.measures?.[gauge.measureType]);
    return {
      key: getTrentStationKey(gauge),
      name: gauge.gaugeName,
      measureType: gauge.measureType,
      ...describeMeasureUnits(gauge.measureType),
      latest: series[0] ?? null,
      trend: describeTrend(series, { measureType: gauge.measureType }),
    };
  });
}

/** "14:05" today, or "Tue 14:05" on another day, in UK time. */
export function formatClockTime(date, now = new Date()) {
  const options = { timeZone: "Europe/London" };
  const time = date.toLocaleTimeString("en-GB", { ...options, hour: "2-digit", minute: "2-digit" });
  const sameDay = date.toLocaleDateString("en-GB", options) === now.toLocaleDateString("en-GB", options);
  return sameDay ? time : `${date.toLocaleDateString("en-GB", { ...options, weekday: "short" })} ${time}`;
}
