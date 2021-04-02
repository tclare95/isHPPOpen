import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useFetchedEvents } from "../../libs/eventsswrhook";
import EventsForm from "./eventsform";
import useSWR from "swr";
import { fetcher } from "../../libs/fetcher";

export default function EventsTable() {
  const { data, error, mutate } = useSWR("/api/events", fetcher);

  if (!data) {
    return <p>Events Loading</p>;
  }

  if (error) {
    return <p>Error Fetching events</p>;
  }
  if (data) {
    return (
      <div>
        <Row>
          {data &&
            data.map((event, index) => (
              <Col md={4} className="m-2">
                <EventsForm
                  key={event._id}
                  id={event._id}
                  name={event.event_name}
                  startDate={new Date(event.event_start_date)}
                  endDate={new Date(event.event_end_date)}
                  eventDetails={event.event_details}
                />
              </Col>
            ))}
        </Row>
        <Row>
          <h2 className="text-light mx-auto my-4">Add new event:</h2>
        </Row>
        <Row className="pb-4">
          <EventsForm />
        </Row>
      </div>
    );
  }
  return <p>Events Loading</p>;
}
