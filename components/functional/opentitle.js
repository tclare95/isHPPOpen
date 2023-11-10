const currentTime = new Date();
const tomorrowTime = currentTime.setDate(1);
import Link from "next/link";
import { useFetchedLevels } from "../../libs/levelsswrhook";
import { useFetchedStatus } from "../../libs/statussswrhook";


export default function OpenTitle(props) {
  const { levelData, error, isPending } = useFetchedLevels();
  const { statusData, statusError, statusPending } = useFetchedStatus();

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
    const lastChangedDate = new Date(statusData.lastChangedDate);
    const daysSinceLastOpen = Math.floor((currentDate - lastChangedDate) / (1000 * 60 * 60 * 24));

  //pull the event array, check if the current date falls between two events
  const isClosedForEvent = cachedEvents.some(event => {
    const startDate = new Date(event.event_start_date);
    const endDate = new Date(event.event_end_date);
    return startDate <= currentDate && endDate >= currentDate
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
      <a 
      className="font-weight-light font-italic text-muted text-decoration-none"
      href="#booking"
      >
        Pre booking recommended!
      </a>
    </h2>
  );
}
