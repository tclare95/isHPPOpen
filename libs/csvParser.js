/**
 * CSV Parser utilities for parsing S3 forecast data
 *
 * Provides reusable CSV parsing functions to reduce duplication
 * across forecast-related API routes.
 */

const normalizeCsvText = (csvText) => csvText.trim();

const splitCsvLines = (csvText) => normalizeCsvText(csvText).split(/\r?\n/);

const splitCsvRow = (line) => line.split(',').map((part) => part.trim());

const getDataLines = (lines) => lines.slice(1).filter((line) => line.trim() !== '');

const parseNullableFloat = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (normalizedValue === '') {
    return null;
  }

  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const parseNullableInt = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  if (normalizedValue === '') {
    return null;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

/**
 * Generic CSV parser that splits CSV text into rows and applies a row parser
 * @param {string} csvText - Raw CSV text content
 * @param {function} rowParser - Function that takes a CSV row (string) and returns parsed object
 * @returns {Array} Array of parsed objects, filtered to remove invalid entries
 */
export function parseCSV(csvText, rowParser) {
  const trimmedCsvText = normalizeCsvText(csvText);
  if (!trimmedCsvText) {
    return [];
  }

  const lines = splitCsvLines(trimmedCsvText);
  if (lines.length < 2) {
    return [];
  }

  // Skip header row
  const dataLines = getDataLines(lines);

  return dataLines
    .map((line) => rowParser(line))
    .filter(Boolean);
}

/**
 * Parse forecast CSV row into forecast data object
 * @param {string} line - Single CSV row
 * @returns {Object|null} Parsed forecast object or null if invalid
 */
export function parseForecastRow(line) {
  const [forecast_time, target_time, horizon_hours, predicted_level, current_level] = splitCsvRow(line);

  const forecast_reading = parseNullableFloat(predicted_level);
  const parsedHorizonHours = parseNullableFloat(horizon_hours);

  if (forecast_reading === null || parsedHorizonHours === null) {
    return null;
  }

  return {
    forecast_date: target_time,
    forecast_reading,
    forecast_time,
    horizon_hours: parsedHorizonHours,
    current_level: parseNullableFloat(current_level),
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
  ] = splitCsvRow(line);

  const parsedHorizon = parseNullableInt(horizon_hours);
  const parsedPredictionsCompared = parseNullableInt(predictions_compared);

  if (parsedHorizon === null || parsedPredictionsCompared === null) {
    return null;
  }

  return {
    evaluation_time,
    horizon_hours: parsedHorizon,
    forecast_made_at,
    predictions_compared: parsedPredictionsCompared,
    mae: parseNullableFloat(mae),
    rmse: parseNullableFloat(rmse),
    bias: parseNullableFloat(bias),
    max_error: parseNullableFloat(max_error),
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
  const parts = splitCsvRow(line);
  const [forecast_time, target_time, horizon_hours, predicted_level, current_level] = parts;
  const stability_std = parts[5]; // May be undefined if column doesn't exist

  const forecast_reading = parseNullableFloat(predicted_level);
  const parsedHorizonHours = parseNullableFloat(horizon_hours);

  if (forecast_reading === null || parsedHorizonHours === null) {
    return null;
  }

  return {
    forecast_date: target_time,
    forecast_reading,
    forecast_time,
    horizon_hours: parsedHorizonHours,
    current_level: parseNullableFloat(current_level),
    stability_std: parseNullableFloat(stability_std),
  };
}

/**
 * Parse stability CSV row into stability data object using header-based column lookup
 * @param {string} line - Single CSV row
 * @param {Object} columnIndices - Map of column names to indices
 * @returns {Object|null} Parsed stability object or null if invalid
 */
function parseStabilityRowWithHeaders(line, columnIndices) {
  const parts = splitCsvRow(line);

  const getValue = (colName) => {
    const idx = columnIndices[colName];
    if (idx === undefined || idx >= parts.length) return null;
    const val = parts[idx];
    return parseNullableFloat(val);
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
  const trimmedCsvText = normalizeCsvText(csvText);
  if (!trimmedCsvText) {
    return [];
  }

  const lines = splitCsvLines(trimmedCsvText);
  if (lines.length < 2) {
    return [];
  }

  // Parse header to get column indices
  const columnIndices = Object.fromEntries(
    splitCsvRow(lines[0]).map((header, index) => [header, index]),
  );

  // Parse data rows
  const dataLines = getDataLines(lines);
  return dataLines
    .map((line) => parseStabilityRowWithHeaders(line, columnIndices))
    .filter(Boolean);
}
