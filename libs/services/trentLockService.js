import axios from 'axios';
import { connectToDatabase } from '../database';
import { HttpError } from '../api/http';

const LEVEL_STATIONS = [
  ['colwick', 4009, 0],
  ['clifton', 4126, 2000],
  ['shardlow', 4007, 4000],
  ['churchWilne', 4067, 6000],
  ['kegworth', 4074, 8000],
];

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

async function getLevelByStation(stationId, dateObject, delay, httpClient = axios, sleepFn = sleep) {
  const rows = [];
  const dayZero = dateObject.toISOString().split('T')[0];
  const dayMinusSeven = new Date(dateObject);
  dayMinusSeven.setDate(dayMinusSeven.getDate() - 7);
  const dayMinusSevenString = dayMinusSeven.toISOString().split('T')[0];

  await sleepFn(delay);

  const levelZero = await httpClient.get(
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&startdate=${dayMinusSevenString}&enddate=${dayZero}&parameter=level`
  );

  levelZero.data.items.forEach((item) => rows.push({ date: item.dateTime, level: item.value }));
  return rows;
}

export async function recordTrentLockSubmission(parsedRequest, dependencies = {}) {
  const submissionDate = new Date(parsedRequest.dateTime);
  const httpClient = dependencies.httpClient ?? axios;
  const sleepFn = dependencies.sleepFn ?? sleep;

  const values = await Promise.allSettled(
    LEVEL_STATIONS.map((station) => getLevelByStation(station[1], submissionDate, station[2], httpClient, sleepFn))
  );

  const levels = {};
  values.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      levels[LEVEL_STATIONS[index][0]] = result.value;
    }
  });

  const levelsFetchFailed = values.some((result) => result.status === 'rejected');

  const { db } = await connectToDatabase();
  const collection = db.collection('trentlockdata');
  const result = await collection.insertOne({
    date: parsedRequest.dateTime,
    dateCreated: new Date(),
    userRange: parsedRequest.range,
    userComment: levelsFetchFailed ? parsedRequest.comment : parsedRequest.comments,
    userBoat: levelsFetchFailed ? parsedRequest.boat : parsedRequest.boatType,
    recordedLevels: levelsFetchFailed ? null : levels,
  });

  if (!result.insertedId) {
    throw new HttpError(500, 'Failed to save data');
  }

  return {
    message: 'Update successful',
    id: result.insertedId.toString(),
  };
}
