const axios = require("axios");

Date.prototype.addDays = function(days) {
    let date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
  }
  
 
let date = new Date();
let now = new Date();

export default (req, res) => {
    let daysToAdd;
    req.query.length ? daysToAdd = parseInt(req.query.length) : daysToAdd = 28;
    console.log(daysToAdd)
    const futureDate = date.addDays(daysToAdd);
    axios.post('https://www.nwscnotts.com/nwsc/Timetable/GetClassTimeTable', {
    BehaviourIdList: 2339,
    FacilityIdList: 82,
    DateTo: futureDate,
    DateFrom: now
  })
  .then(function (response) {
    const arrayToSend = []
    response.data.Results.forEach(session => {
                arrayToSend.push(session)
    })
    arrayToSend.sort((a, b) => {
      const aDate =  new Date(a.StartDatetime);
      // console.log(aDate)
      const bDate =  new Date(b.StartDatetime);
      // console.log(bDate)

      if (aDate < bDate) {
        return -1;
      }

      if (aDate > bDate) {
        return 1;
      }
      return 0
    })
    res.json(arrayToSend);
  })
  .catch(function (error) {
    console.log(error);
    res.status(404).send()
  });
}