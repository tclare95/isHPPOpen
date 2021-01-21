import { useFetchedEvents } from "../../libs/eventsswrhook"
import Event from './event';

export default function Events () {
    const { eventData, eventError, eventIsPending } = useFetchedEvents();

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
    return (
        <div>
             {eventData.map((event, index) => (
               <div>
               <Event key={event._id} name={event.event_name} startDate={event.event_start_date} endDate={event.event_end_date} eventDetails={event.event_details}/>
               </div>
           ))}
        </div>
    ) }
    return (
        <div>Unknown Error</div>
    )
}