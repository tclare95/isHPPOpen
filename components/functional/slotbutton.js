Date.prototype.addDays = function (days) {
  let date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  date.setUTCHours(23);
  return date;
};

const now = new Date();

export default function SlotButton(props) {
  console.log(props.day);
  console.log(now.addDays(7));
  if (props.day > now.addDays(7)) {
    return (
        <a
        className="btn btn-sm btn-primary m-1"
      >
        Booking will be available on {props.day.addDays(-7).toLocaleDateString()}
      </a>
    )
  }
  if (props.remaining) {
    return (
      <a
        className="btn btn-sm btn-primary m-1"
        target="_blank"
        rel="noopener noreferrer"
        href="https://www.nwscnotts.com/nwsc/bookingscentre/index"
      >
        Click Here to Book
      </a>
    );
  }
  return null;
}
