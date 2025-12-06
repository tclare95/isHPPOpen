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
