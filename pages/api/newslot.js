const axios = require("axios");
const qs = require("qs");

export default (req, res) => {
  // Get the day offset from the query params, default to zero
  let dayOffset;
  req.query.offset ? (dayOffset = req.query.offset) : (dayOffset = 0);
  // Add required information to formData

  const data = {
    CurrentUmbracoPageId: "2396",
    SelectedDayOffset: dayOffset,
    TimetableLocation: "82",
  };
  // send post to hpp api
  axios
    .post(
      "https://www.nwscnotts.com/umbraco/LegendTimetable/LegendTimetable/Fetch",
      qs.stringify(data)
    )
    .then(function (response) {
      // Set up an array to add responses to
      let arrayToSend = [];
      // From the Response array of activities filter out the whitewater ones, and add them to an array
      response.data.ClassActivities.ClassActivitiesByDay.forEach((element) => {
        if (element.SessionName === "White Water Course") {
          arrayToSend.push(element);
        }
      });
      // Send the array back
      console.log(req.query.offset);
      res.json(arrayToSend);
    })
    .catch(function (error) {
      res.status(404).send();
    });
};
