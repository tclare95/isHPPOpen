import { connectToDatabase } from '../database';
import { parseCSVToAccuracy, parseCSVToForecastWithStability, parseCSVToStability } from '../csvParser';

export async function getLevelsData() {
  const { db } = await connectToDatabase();
  const collection = await db.collection('riverschemas');
  const data = await collection.find().sort({ _id: -1 }).limit(1).next();

  if (!data) {
    return { level_data: [], forecast_data: [] };
  }

  return {
    level_data: data.level_readings || [],
    forecast_data: data.forecast_readings || [],
  };
}

export async function getS3ForecastData() {
  const s3Url = process.env.S3_FORECAST_URL;
  if (!s3Url) {
    return null;
  }

  const response = await fetch(s3Url);
  if (!response.ok) {
    return null;
  }

  const csvText = await response.text();
  const forecastData = parseCSVToForecastWithStability(csvText);
  const firstRow = forecastData[0];

  return {
    forecast_data: forecastData,
    metadata: firstRow
      ? {
          forecast_time: firstRow.forecast_time,
          current_level: firstRow.current_level,
        }
      : null,
  };
}

export async function getForecastAccuracyData() {
  const s3Url = process.env.S3_FORECAST_ACCURACY_URL;
  if (!s3Url) {
    return null;
  }

  const response = await fetch(s3Url);
  if (!response.ok) {
    return null;
  }

  const csvText = await response.text();
  const accuracyData = parseCSVToAccuracy(csvText);

  return {
    accuracy_data: accuracyData,
    evaluation_time: accuracyData[0]?.evaluation_time || null,
  };
}

export async function getForecastStabilityData() {
  const s3Url = process.env.S3_FORECAST_STABILITY_URL;
  if (!s3Url) {
    return { stability_data: [] };
  }

  const response = await fetch(s3Url);
  if (!response.ok) {
    return { stability_data: [] };
  }

  const csvText = await response.text();
  const stabilityData = parseCSVToStability(csvText);
  return { stability_data: stabilityData };
}
