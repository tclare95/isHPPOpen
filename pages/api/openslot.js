const axios = require("axios");

Date.prototype.addDays = function(days) {
    let date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
  }
  
 
let date = new Date();
let now = new Date();

export default (req, res) => {
    const futureDate = date.addDays(28);
    axios.post('https://www.nwscnotts.com/Enterprise/api/SessionSearch', {
    ActivityId: 91,
    CapacityTypeId: 1,
    FacilityId: 82,
    LocationId: 3165,
    SearchedEndDate: futureDate,
    SearchedStartDate: now
  })
  .then(function (response) {
    const arrayToSend = []
    response.data.SessionDetails.forEach(session => {
        if(session.RemainingOnlineCapacity > 0) {
            arrayToSend.push(session)
        }
    })
    res.json(arrayToSend);
  })
  .catch(function (error) {
    console.log(error);
    res.status(404).end()
  });
}