import Row from "react-bootstrap/Row";
import Table from "react-bootstrap/Table";
import { useFetchedEvents } from "../../libs/eventsswrhook"
import Button from "react-bootstrap/Button"
import EventsForm from './eventsform'
export default function EventsTable () {
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
           
               <Row>
                   {eventData.map((event, index) => (
                        <EventsForm key={event._id} id={event._id} name={event.event_name} startDate={new Date(event.event_start_date)} endDate={new Date(event.event_end_date)} eventDetails={event.event_details}/>
            
                    ))}
               </Row>
                <div className="m-2">
                    <h2 className="text-light">Add new event:</h2> 
                    <EventsForm />
                </div>
       </div>

    ) }
    return (
        <div>Unknown Error</div>
    )
}



                    
