import axios from "axios";
import { connectToDatabase } from "../../libs/database";

const ALLOWED_METHODS = ['POST'];

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
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const timestamp = new Date().toISOString();
  try {
    const { body } = req;
    let submissionDate;
    let parsedRequest;
    
    // Parse the request body
    try {
      parsedRequest = JSON.parse(Object.keys(body)[0]);
      submissionDate = new Date(parsedRequest.dateTime);
    } catch (parseError) {
      console.error(`[${timestamp}] [${req.method}] JSON parse error:`, parseError);
      return res.status(400).json({ message: "Error parsing request body" });
    }

    // Fetch river level data from EA API
    const levelStations = [
      ["colwick", 4009, 0],
      ["clifton", 4126, 2000],
      ["shardlow", 4007, 4000],
      ["churchWilne", 4067, 6000],
      ["kegworth", 4074, 8000],
    ];

    let levels = {};
    let levelsFetchFailed = false;

    try {
      const levelData = levelStations.map((station) =>
        getLevelByStation(station[1], submissionDate, station[2])
      );

      const values = await Promise.all(levelData);
      values.forEach((value, index) => {
        levels[levelStations[index][0]] = value;
      });
    } catch (error) {
      console.error(`[${timestamp}] Error getting levels, saving basic data`);
      levelsFetchFailed = true;
    }

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
      return res.status(200).json({ message: "Update successful" });
    } else {
      console.error(`[${timestamp}] Insert failed for trentlock data`);
      return res.status(500).json({ message: "Failed to save data" });
    }
  } catch (error) {
    console.error(`[${timestamp}] [${req.method}] Error in trentlockapi:`, error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
