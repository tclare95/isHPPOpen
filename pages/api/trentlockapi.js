import axios from "axios";
import { connectToDatabase } from "../../libs/database";

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
        console.log(error.response.status);
      }
    });

  try {
    levelZero.data.items.forEach((item) =>
      arrayToReturn.push({ date: item.dateTime, level: item.value })
    );
    return arrayToReturn;
  } catch (error) {
    console.log("error getting level data for station", stationId);
    console.log(error);
    throw error;
  }
};

export default async function handler(req, res) {
  try {
    const { method, body } = req;
    let submissionDate;
    let parsedRequest;
    // try parsing the body once
    try {
      parsedRequest = JSON.parse(Object.keys(body)[0]);
      submissionDate = new Date(parsedRequest.dateTime);
      res.status(200).json({ message: "Update successful" });
    } catch (parseError) {
      console.error(`[${new Date().toISOString()}] [${req.method}] JSON parse error:`, parseError);
      return res.status(403).json({ message: "Error parsing request body" });
    }
    // this stuff is all done asynchronously, so we can't return a response here
    // access the EA API, pull data for colwick (#12345), clifton (#12346), shardlow(#123456), church wilne (#1234567), and kegworth (#12345678) for the previous 7 days.
    // return the data as a JSON object
    const levelStations = [
      ["colwick", 4009, 0],
      ["clifton", 4126, 2000],
      ["shardlow", 4007, 4000],
      ["churchWilne", 4067, 6000],
      ["kegworth", 4074, 8000],
    ];

    // some working variables for getting the river level data
    let levelData = [];
    let levels = {};
    // try getting the levels, if it fails, return an error and save the basic data
    try {
      levelStations.forEach((station) => {
          levelData.push(getLevelByStation(station[1], submissionDate, station[2]));
      });

      // resolve promises and map into return object
      await Promise.all(levelData).then((values) => {
          // push into return object (levels)
          values.forEach((value, index) => {
              levels[levelStations[index][0]] = value;
          }
          );
      });
    } catch (error) {
      console.log("error getting levels, saving basic data");
      // as a backup, if the river level call fails write the user input to the database with blank river levels
      const documentToInsert = {
        date: parsedRequest.dateTime,
        dateCreated: new Date(),
        userRange: parsedRequest.range,
        userComment: parsedRequest.comment,
        userBoat: parsedRequest.boat,
        recordedLevels: null,
      };
      const { db } = await connectToDatabase();
      const collection = db.collection("trentlockdata");
      const result = await collection.insertOne(documentToInsert);
    }

    // if the above has worked, do the main datavase write

      const { db } = await connectToDatabase();
      try {

        const documentToInsert = {
          date: parsedRequest.dateTime,
          dateCreated: new Date(),
          userRange: parsedRequest.range,
          userComment: parsedRequest.comments,
          userBoat: parsedRequest.boatType,
          recordedLevels: levels,
        };

        const collection = db.collection("trentlockdata");
        const result = await collection.insertOne(documentToInsert);
        if (result) {
        } else {
          console.log("insert failed error");
        }
      } catch (error) {
        console.log("error", error);
      }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${req.method}] Error in trentlockapi:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
