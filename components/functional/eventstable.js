import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { useFetchedEvents } from "../../libs/eventsswrhook";
import EventsForm from "./eventsform";
import useSWR from "swr";
import { fetcher } from "../../libs/fetcher";

export default function EventsTable() {
  const { data, error, mutate } = useSWR("/api/events?limit=99", fetcher);

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
          <h2 className="text-light mx-auto my-4">Current events:</h2>
        </Row>
        <Row xs={1} sm={2} md={3} lg={4} className="g-4">
          {data &&
            data.eventsArray.map((event) => (
              <Col key={event._id}>
                <EventsForm
                  id={event._id}
                  name={event.event_name}
                  startDate={new Date(event.event_start_date)}
                  endDate={new Date(event.event_end_date)}
                  eventDetails={event.event_details}
                  isNew={true}
                  mutate={mutate}
                />
              </Col>
            ))}
          {data.eventsArray.length === 0 && (
            <h4 className="text-light mx-auto my-0">No events</h4>
          )}
        </Row>
        <Row>
          <h2 className="text-light mx-auto my-4">Add new event:</h2>
        </Row>
        <Row className="pb-4">
          <EventsForm isNew={false} mutate={mutate} />
        </Row>
      </div>
    );
  }
  return <p>Events Loading</p>;
}
