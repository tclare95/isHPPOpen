import axios from "axios";
import { connectToDatabase } from "../../../libs/database";
import { HttpError, mapApiError } from "../../../libs/api/http";
import { parseJsonObjectBody, sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";

export const dynamic = "force-dynamic";

const getLevelByStation = async (stationId, dateObject, delay) => {
  const rows = [];
  const dayZero = dateObject.toISOString().split("T")[0];
  const dayMinusSeven = new Date(dateObject);
  dayMinusSeven.setDate(dayMinusSeven.getDate() - 7);
  const dayMinusSevenString = dayMinusSeven.toISOString().split("T")[0];

  await new Promise((resolve) => setTimeout(resolve, delay));

  const levelZero = await axios.get(
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&startdate=${dayMinusSevenString}&enddate=${dayZero}&parameter=level`
  );

  levelZero.data.items.forEach((item) => rows.push({ date: item.dateTime, level: item.value }));
  return rows;
};

export async function POST(request) {
  try {
    const parsedRequest = await parseJsonObjectBody(request);
    const submissionDate = new Date(parsedRequest.dateTime);

    const levelStations = [["colwick", 4009, 0],["clifton", 4126, 2000],["shardlow", 4007, 4000],["churchWilne", 4067, 6000],["kegworth", 4074, 8000]];
    const values = await Promise.allSettled(levelStations.map((s) => getLevelByStation(s[1], submissionDate, s[2])));

    const levels = {};
    values.forEach((result, index) => {
      if (result.status === "fulfilled") levels[levelStations[index][0]] = result.value;
    });

    const levelsFetchFailed = values.some((r) => r.status === "rejected");

    const { db } = await connectToDatabase();
    const collection = db.collection("trentlockdata");
    const result = await collection.insertOne({
      date: parsedRequest.dateTime,
      dateCreated: new Date(),
      userRange: parsedRequest.range,
      userComment: levelsFetchFailed ? parsedRequest.comment : parsedRequest.comments,
      userBoat: levelsFetchFailed ? parsedRequest.boat : parsedRequest.boatType,
      recordedLevels: levelsFetchFailed ? null : levels,
    });

    if (!result.insertedId) throw new HttpError(500, "Failed to save data");
    return sendRouteSuccess({ message: "Update successful", id: result.insertedId.toString() });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
