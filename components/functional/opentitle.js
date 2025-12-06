import Link from "next/link";
import useFetch from "../../libs/useFetch";
import PropTypes from "prop-types";


export default function OpenTitle(props) {
  const { data: levelData, error, isPending } = useFetch("/api/levels");
  const { data: statusData, error: statusError, isPending: statusPending } = useFetch("/api/hppstatus");

  const cachedEvents = props.cachedEvents;

  if (error || statusError) {
    return <div>Error Loading</div>;
  }

  if (( isPending || statusPending)  && !cachedEvents) {
    return <div>Loading</div>;
  }
  if (!levelData || !statusData) {
    return <div>Loading</div>;
  }

    // Calculate days since HPP was last open
    const currentDate = new Date();
    const lastChangedDate = new Date(statusData.effectiveLastOpenDate);
    const daysSinceLastOpen = Math.floor((currentDate - lastChangedDate) / (1000 * 60 * 60 * 24));

  //pull the event array, check if the current date falls between two events
  const isClosedForEvent = cachedEvents.some(event => {
    const startDate = new Date(event.event_start_date);
    const endDate = new Date(event.event_end_date);

    // Normalize dates to ignore time portion
    const normalizedCurrentDate = new Date(currentDate.toDateString());
    const normalizedStartDate = new Date(startDate.toDateString());
    const normalizedEndDate = new Date(endDate.toDateString());

    return normalizedStartDate <= normalizedCurrentDate && normalizedEndDate >= normalizedCurrentDate;
  });

  if (isClosedForEvent) {
    return (
      <h2 className="font-weight-bold m-3">
        HPP is <span className="text-danger">Closed</span> for an event
      </h2>
    );
  }
  //check if the most recent recorded river level is >2.2m
  if (levelData.level_data[0].reading_level > 2.2) {
    return (
      <>
      <h2 className="font-weight-bold m-3">
        HPP is <span className="text-danger">Closed</span> because of water
        levels
      </h2>
      <h6 className="font-weight-lighter fst-italic">
       HPP has been closed for {daysSinceLastOpen} days due to high water levels.  <Link href="#stats">(tap to see more)</Link>
      </h6>
      </>
    );
  }

  return (
    <h2 className="font-weight-bold m-3">
      HPP is (probably) <span className="text-success">Open</span>
      <br />{" "}
    </h2>
  );
}

OpenTitle.propTypes = {
  cachedEvents: PropTypes.arrayOf(
    PropTypes.shape({
      event_start_date: PropTypes.string.isRequired,
      event_end_date: PropTypes.string.isRequired,
    })
  ),
};
