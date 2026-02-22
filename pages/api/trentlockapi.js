import axios from "axios";
import { connectToDatabase } from "../../libs/database";
import {
  HttpError,
  getMethodHandler,
  mapApiError,
  parseJsonObjectBody,
  sendApiError,
  sendApiSuccess,
} from "../../libs/api/http";

const getLevelByStation = async (stationId, dateObject, delay) => {
  //takes a station id and a date object and returns the level at the station for the preceding 2 days.
  // returns an array of objects with the date and level
  
  let arrayToReturn = [];
  const dayZero = dateObject.toISOString().split("T")[0];
  let dayminusSeven = new Date(dateObject);
  dayminusSeven.setDate(dayminusSeven.getDate() - 7);
  const dayMinusSevenString = dayminusSeven.toISOString().split("T")[0];

  // add 2s delay between each request to avoid overloading the EA API
  await new Promise((resolve) => setTimeout(resolve, delay));

  const levelZero = await axios
    .get(
      `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&startdate=${dayMinusSevenString}&enddate=${dayZero}&parameter=level`
    )
    .catch((error) => {
      if (error.response) {
        console.error(`[${new Date().toISOString()}] EA API error status:`, error.response.status);
      }
    });

  try {
    levelZero.data.items.forEach((item) =>
      arrayToReturn.push({ date: item.dateTime, level: item.value })
    );
    return arrayToReturn;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error getting level data for station`, stationId, error);
    throw error;
  }
};

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const handlers = {
    POST: async () => {
      const parsedRequest = parseJsonObjectBody(req.body);
      const submissionDate = new Date(parsedRequest.dateTime);

      // Fetch river level data from EA API
      const levelStations = [
        ["colwick", 4009, 0],
        ["clifton", 4126, 2000],
        ["shardlow", 4007, 4000],
        ["churchWilne", 4067, 6000],
        ["kegworth", 4074, 8000],
      ];

      const levels = {};
      const levelData = levelStations.map((station) =>
        getLevelByStation(station[1], submissionDate, station[2])
      );
      const values = await Promise.allSettled(levelData);

      const levelsFetchFailed = values.some((result) => result.status === "rejected");
      if (levelsFetchFailed) {
        console.error(`[${timestamp}] Error getting levels, saving basic data`);
      }

      values.forEach((result, index) => {
        if (result.status === "fulfilled") {
          levels[levelStations[index][0]] = result.value;
        }
      });

      // Save to database
      const { db } = await connectToDatabase();
      const collection = db.collection("trentlockdata");

      const documentToInsert = {
        date: parsedRequest.dateTime,
        dateCreated: new Date(),
        userRange: parsedRequest.range,
        userComment: levelsFetchFailed ? parsedRequest.comment : parsedRequest.comments,
        userBoat: levelsFetchFailed ? parsedRequest.boat : parsedRequest.boatType,
        recordedLevels: levelsFetchFailed ? null : levels,
      };

      const result = await collection.insertOne(documentToInsert);

      if (result.insertedId) {
        console.log(`[${timestamp}] Trentlock data saved successfully`);
        sendApiSuccess(res, { message: "Update successful", id: result.insertedId.toString() });
        return;
      }

      console.error(`[${timestamp}] Insert failed for trentlock data`);
      throw new HttpError(500, "Failed to save data");
    },
  };

  try {
    const methodHandler = getMethodHandler(req, res, handlers);
    if (!methodHandler) {
      return;
    }

    await methodHandler();
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    console.error(`[${timestamp}] [${req.method}] Error in trentlockapi:`, error);
    return sendApiError(res, statusCode, message);
  }
}
