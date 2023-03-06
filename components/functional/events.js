import { useFetchedEvents } from "../../libs/eventsswrhook"
import { useState } from "react";
import Event from './event';
import Button from "react-bootstrap/Button";


export default function Events () {
    const [limit, setLimit] = useState(3);
    const { eventData, eventError, eventIsPending } = useFetchedEvents(limit);
    

    if(eventIsPending) {
        return (
            <p>Events Loading</p>
        )
    }

    if(eventError) {
        return (
        <p>Error Fetching events</p>
        )
    }
    if (eventData) {
        const eventArray = eventData && eventData.eventsArray;

        // sort events by date
        eventArray.sort((a, b) => {
            return new Date(a.event_start_date) - new Date(b.event_start_date);
        });
    return (
        <div>
            <h6>Showing {limit} of {eventData.count} events</h6>
             {eventArray.map((event, index) => (
               <div>
               <Event key={event._id} name={event.event_name} startDate={event.event_start_date} endDate={event.event_end_date} eventDetails={event.event_details}/>
               </div>
           ))}
           {
            // see more button that updates the hook to load the next 3 events. If limit = the amount of events, hide the button
            limit >= eventData.count ? null : <Button onClick={() => setLimit(limit + 3)}>See More</Button>
            

           }
        </div>
    ) }
    return (
        <div>Unknown Error</div>
    )
}