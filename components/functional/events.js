import useFetch from "../../libs/useFetch";
import { useState, useMemo } from "react";
import Event from './event';
import Button from "react-bootstrap/Button";
import { SWR_EDITORIAL } from "../../libs/dataFreshness";
import StatusMessage from "../layout/site/StatusMessage";

export default function Events() {
    const [limit, setLimit] = useState(3);
    const { data: eventData, error: eventError, isPending: eventIsPending } = useFetch(`/api/events?limit=${limit}`, SWR_EDITORIAL);

    // useMemo to sort only when eventData changes
    const sortedEvents = useMemo(() => {
        return eventData?.eventsArray.sort((a, b) => new Date(a.event_start_date) - new Date(b.event_start_date));
    }, [eventData]);

    if (eventIsPending) return <StatusMessage state="loading" className="mt-3">Loading events…</StatusMessage>;
    if (eventError) return <StatusMessage state="unavailable" className="mt-3">Events could not be loaded right now.</StatusMessage>;

    // Adjust displayed limit based on actual events count
    const displayLimit = eventData && eventData.count < limit ? eventData.count : limit;

    if (eventData && sortedEvents) {
        return (
            <div>
                <p className="history-muted small mt-3 mb-0">Showing {displayLimit} of {eventData.count} events</p>
                {sortedEvents.map((event, index) => (
                    <Event key={event._id} name={event.event_name} startDate={event.event_start_date} endDate={event.event_end_date} eventDetails={event.event_details} />
                ))}
                {displayLimit >= eventData.count ? null : <Button variant="outline-light" size="sm" className="mt-3" onClick={() => setLimit(limit + 3)}>Show more</Button>}
            </div>
        );
    }

    return <StatusMessage state="unavailable" className="mt-3">Events could not be loaded right now.</StatusMessage>;
}
