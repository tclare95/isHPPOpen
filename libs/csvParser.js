/**
 * CSV Parser utilities for parsing S3 forecast data
 * 
 * Provides reusable CSV parsing functions to reduce duplication
 * across forecast-related API routes.
 */

/**
 * Generic CSV parser that splits CSV text into rows and applies a row parser
 * @param {string} csvText - Raw CSV text content
 * @param {function} rowParser - Function that takes a CSV row (string) and returns parsed object
 * @returns {Array} Array of parsed objects, filtered to remove invalid entries
 */
export function parseCSV(csvText, rowParser) {
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    return [];
  }

  // Skip header row
  const dataLines = lines.slice(1);

  return dataLines
    .map(rowParser)
    .filter(Boolean);
}

/**
 * Parse forecast CSV row into forecast data object
 * @param {string} line - Single CSV row
 * @returns {Object|null} Parsed forecast object or null if invalid
 */
export function parseForecastRow(line) {
  const [forecast_time, target_time, horizon_hours, predicted_level, current_level] = line.split(',');
  
  const forecast_reading = parseFloat(predicted_level);
  if (isNaN(forecast_reading)) {
    return null;
  }

  return {
    forecast_date: target_time,
    forecast_reading,
    forecast_time,
    horizon_hours: parseFloat(horizon_hours),
    current_level: parseFloat(current_level),
  };
}

/**
 * Parse accuracy CSV row into accuracy data object
 * @param {string} line - Single CSV row
 * @returns {Object|null} Parsed accuracy object or null if invalid
 */
export function parseAccuracyRow(line) {
  const [
    evaluation_time,
    horizon_hours,
    forecast_made_at,
    predictions_compared,
    mae,
    rmse,
    bias,
    max_error
  ] = line.split(',');
  
  const parsedHorizon = parseInt(horizon_hours, 10);
  if (isNaN(parsedHorizon)) {
    return null;
  }

  return {
    evaluation_time,
    horizon_hours: parsedHorizon,
    forecast_made_at,
    predictions_compared: parseInt(predictions_compared, 10),
    mae: mae ? parseFloat(mae) : null,
    rmse: rmse ? parseFloat(rmse) : null,
    bias: bias ? parseFloat(bias) : null,
    max_error: max_error ? parseFloat(max_error) : null,
  };
}

/**
 * Parse forecast CSV text into array of forecast objects
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of forecast data objects
 */
export function parseCSVToForecast(csvText) {
  return parseCSV(csvText, parseForecastRow);
}

/**
 * Parse accuracy CSV text into array of accuracy objects
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of accuracy data objects
 */
export function parseCSVToAccuracy(csvText) {
  return parseCSV(csvText, parseAccuracyRow);
}

/**
 * Parse forecast CSV row with stability data into forecast data object
 * Expected columns: forecast_time, target_time, horizon_hours, predicted_level, current_level, stability_std (optional)
 * @param {string} line - Single CSV row
 * @returns {Object|null} Parsed forecast object with stability or null if invalid
 */
export function parseForecastRowWithStability(line) {
  const parts = line.split(',');
  const [forecast_time, target_time, horizon_hours, predicted_level, current_level] = parts;
  const stability_std = parts[5]; // May be undefined if column doesn't exist
  
  const forecast_reading = parseFloat(predicted_level);
  if (isNaN(forecast_reading)) {
    return null;
  }

  // Handle stability_std: could be undefined, empty string, or a number
  let parsedStability = null;
  if (stability_std !== undefined && stability_std !== '') {
    const parsed = parseFloat(stability_std);
    if (!isNaN(parsed)) {
      parsedStability = parsed;
    }
  }

  return {
    forecast_date: target_time,
    forecast_reading,
    forecast_time,
    horizon_hours: parseFloat(horizon_hours),
    current_level: parseFloat(current_level),
    stability_std: parsedStability,
  };
}

/**
 * Parse stability CSV row into stability data object
 * Expected columns: target_time, forecast_current, forecast_1h_ago, forecast_2h_ago, ..., forecast_12h_ago, stability_std, stability_range, revision_trend
 * @param {string} line - Single CSV row
 * @returns {Object|null} Parsed stability object or null if invalid
 */
export function parseStabilityRow(line) {
  const parts = line.split(',');
  
  // Expected: target_time, forecast_current, forecast_1h_ago...forecast_12h_ago (12 cols), stability_std, stability_range, revision_trend
  // Total: 1 + 1 + 12 + 3 = 17 columns minimum
  if (parts.length < 17) {
    return null;
  }

  const target_time = parts[0];
  const forecast_current = parseFloat(parts[1]);
  
  if (isNaN(forecast_current)) {
    return null;
  }

  // Parse historical forecasts (forecast_1h_ago through forecast_12h_ago)
  const historical_forecasts = [];
  for (let i = 2; i <= 13; i++) {
    const val = parts[i] ? parseFloat(parts[i]) : null;
    historical_forecasts.push(isNaN(val) ? null : val);
  }

  const stability_std = parts[14] ? parseFloat(parts[14]) : null;
  const stability_range = parts[15] ? parseFloat(parts[15]) : null;
  const revision_trend = parts[16] ? parseFloat(parts[16]) : null;

  return {
    target_time,
    forecast_current,
    historical_forecasts, // Array of 12 values: [1h_ago, 2h_ago, ..., 12h_ago]
    stability_std: isNaN(stability_std) ? null : stability_std,
    stability_range: isNaN(stability_range) ? null : stability_range,
    revision_trend: isNaN(revision_trend) ? null : revision_trend,
  };
}

/**
 * Parse forecast CSV text with stability into array of forecast objects
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of forecast data objects with stability
 */
export function parseCSVToForecastWithStability(csvText) {
  return parseCSV(csvText, parseForecastRowWithStability);
}

/**
 * Parse stability CSV text into array of stability objects
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of stability data objects
 */
export function parseCSVToStability(csvText) {
  return parseCSV(csvText, parseStabilityRow);
}
