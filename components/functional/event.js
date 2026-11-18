import PropTypes from "prop-types";

export default function Event({ name, startDate, endDate, eventDetails }) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (
    <div className="history-tile mt-3">
      <h3 className="h6 mb-1">{name}</h3>
      <p className="history-muted small mb-1">Start date: {start.toDateString()} · End date: {end.toDateString()}</p>
      {eventDetails ? <p className="small mb-0">{eventDetails}</p> : null}
    </div>
  );
}

Event.propTypes = {
  name: PropTypes.string.isRequired,
  startDate: PropTypes.string.isRequired,
  endDate: PropTypes.string.isRequired,
  eventDetails: PropTypes.string,
};
