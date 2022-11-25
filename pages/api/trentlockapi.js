import axios from "axios";
import { connectToDatabase } from "../../libs/database";

const getLevelByStation = async (stationId, dateObject) => {
  //takes a station id and a date object and returns the level at the station for the preceding 2 days.
  // returns an array of objects with the date and level
  let arrayToReturn = [];
  const dayZero = dateObject.toISOString().split("T")[0];
//   const dayOne = new Date(dateObject.setDate(dateObject.getDate() - 1))
//     .toISOString()
//     .split("T")[0];

  const levelZero = await axios.get(
    `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&date=${dayZero}`
  );
//   const levelOne = await axios.get(
//     `https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}/readings?_sorted&date=${dayOne}`
//   );
  levelZero.data.items.forEach((item) =>
    arrayToReturn.push({ date: item.dateTime, level: item.value })
  );
//   levelOne.data.items.forEach((item) =>
//     arrayToReturn.push({ date: item.dateTime, level: item.value })
//   );

  return arrayToReturn;
};

module.exports = async (req, res) => {
  const { method, body } = req;
  let submissionDate;
  // turn the request into a JSON object

  // try parsing the body, if it fails, return an error
  try {
    const request = JSON.parse(Object.keys(body)[0]);
    console.log(request);
    submissionDate = new Date(request.dateTime);
    res.status(200).json({
      message: "Update successful",
    });
  } catch (error) {
    res.status(403).json({
      message: "Error parsing request body",
    });
  }
  // this stuff is all done asynchronously, so we can't return a response here
  // access the EA API, pull data for colwick (#12345), clifton (#12346), shardlow(#123456), church wilne (#1234567), and kegworth (#12345678) for the previous 7 days.
  // also pull the rainfall api data for ashford hall, cresswell, sutton coldfield and wanlip for the previous 7 days.
  // return the data as a JSON object
  const levelStations = {
    colwick: 4009,
    clifton: 2217,
    shardlow: 2100,
    churchWilne: 2130,
    kegworth: 2132,
  };

  const rainfallStations = {
    ashfordHall: 123456789,
    cresswell: 1234567890,
    suttonColdfield: 12345678901,
    wanlip: 123456789012,
  };
  let levelData = {};
  let rainfallData = {};

  try {
    const request = JSON.parse(Object.keys(body)[0]);
    Object.keys(levelStations).forEach((station) => {
      console.log(station);
      console.log(levelStations[station]);
      levelData[station] = getLevelByStation(
        levelStations[station],
        submissionDate
      );
    });

    let levels = await Promise.all(Object.values(levelData));
    console.log(levels);
    // add everything to the database
    const documentToInsert = {
        date: request.dateTime,
        dateCreated: new Date(),
        userRange: request.range,
        userComment: request.comment,
        userBoat: request.boat,
        recordedLevels: levels
    }

    const { db } = await connectToDatabase();
    const collection = db.collection("trentlockdata");
    const result = await collection.insertOne(documentToInsert);
    db.close();
  } catch (error) {
    console.log("error", error);
    db.close();
  }
};
