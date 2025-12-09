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
 * Parse stability CSV row into stability data object using header-based column lookup
 * @param {string} line - Single CSV row
 * @param {Object} columnIndices - Map of column names to indices
 * @returns {Object|null} Parsed stability object or null if invalid
 */
function parseStabilityRowWithHeaders(line, columnIndices) {
  const parts = line.split(',');
  
  const getValue = (colName) => {
    const idx = columnIndices[colName];
    if (idx === undefined || idx >= parts.length) return null;
    const val = parts[idx];
    if (val === undefined || val === '') return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  };
  
  const getStringValue = (colName) => {
    const idx = columnIndices[colName];
    if (idx === undefined || idx >= parts.length) return null;
    return parts[idx] || null;
  };

  const target_time = getStringValue('target_time');
  const forecast_current = getValue('forecast_current');
  
  if (!target_time || forecast_current === null) {
    return null;
  }

  // Parse historical forecasts
  const historical_forecasts = [];
  for (let h = 1; h <= 12; h++) {
    historical_forecasts.push(getValue(`forecast_${h}h_ago`));
  }

  return {
    target_time,
    forecast_current,
    historical_forecasts,
    stability_std: getValue('stability_std'),
    stability_range: getValue('stability_range'),
    revision_trend: getValue('revision_trend'),
    rain_forecast_mm: getValue('rain_forecast_mm'),
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
 * Uses header row to determine column positions for flexibility
 * @param {string} csvText - Raw CSV text content
 * @returns {Array} Array of stability data objects
 */
export function parseCSVToStability(csvText) {
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    return [];
  }

  // Parse header to get column indices
  const headers = lines[0].split(',');
  const columnIndices = {};
  headers.forEach((header, index) => {
    columnIndices[header.trim()] = index;
  });

  // Parse data rows
  const dataLines = lines.slice(1);
  return dataLines
    .map(line => parseStabilityRowWithHeaders(line, columnIndices))
    .filter(Boolean);
}
