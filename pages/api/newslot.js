import axios from "axios";
import qs from "qs";

const fetchTimetableSlots = async (offset = 0) => {
  const data = {
    CurrentUmbracoPageId: "2396",
    SelectedDayOffset: offset,
    TimetableLocation: "82",
  };

  const fetchedData = await axios.post(
    "https://www.nwscnotts.com/umbraco/LegendTimetable/LegendTimetable/Fetch",
    qs.stringify(data)
  );
  // Set up an array to add responses to
  let sessionArray = [];
  // iterate over fetched data and push to array if it is correct
  fetchedData.data.ClassActivities.ClassActivitiesByDay.forEach((element) => {
    if (element.SessionName === "White Water Course") {
      sessionArray.push(element);
    } else if (element.SessionName === "White Water Course - Non World Champs") {
      sessionArray.push(element)
    }
  });
  return sessionArray;
};

export default async function handler(req, res) {
  try {
    const arrayToSend = await fetchTimetableSlots(req.query.offset);
    res.json(arrayToSend);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [${req.method}] Error in newslot:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
