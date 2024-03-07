import { useFetchedEvents } from "../../libs/eventsswrhook"
import { useState, useMemo } from "react";
import Event from './event';
import Button from "react-bootstrap/Button";

export default function Events() {
    const [limit, setLimit] = useState(3);
    const { eventData, eventError, eventIsPending } = useFetchedEvents(limit);

    if (eventIsPending) return <p>Events Loading...</p>;
    if (eventError) return <p>Error Fetching Events</p>;

    // useMemo to sort only when eventData changes
    const sortedEvents = useMemo(() => {
        return eventData?.eventsArray.sort((a, b) => new Date(a.event_start_date) - new Date(b.event_start_date));
    }, [eventData]);

    // Adjust displayed limit based on actual events count
    const displayLimit = eventData && eventData.count < limit ? eventData.count : limit;

    if (eventData && sortedEvents) {
        return (
            <div>
                <h6>Showing {displayLimit} of {eventData.count} events</h6>
                {sortedEvents.map((event, index) => (
                    <Event key={event._id} name={event.event_name} startDate={event.event_start_date} endDate={event.event_end_date} eventDetails={event.event_details} />
                ))}
                {displayLimit >= eventData.count ? null : <Button onClick={() => setLimit(limit + 3)}>See More</Button>}
            </div>
        );
    }

    return <div>Unknown Error</div>;
}
