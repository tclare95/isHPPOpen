import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
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
        <Row className="g-4 justify-content-center">
          {data?.eventsArray?.map((event) => (
              <Col key={event._id} xs="auto" style={{ flex: "0 0 45%" }}>
                <EventsForm
                  id={event._id}
                  name={event.event_name}
                  startDate={event.event_start_date ? new Date(event.event_start_date) : undefined}
                  endDate={event.event_end_date ? new Date(event.event_end_date) : undefined}
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
          <EventsForm
            isNew={false}
            mutate={mutate}
            startDate={new Date()} // added default start date for new events
            endDate={new Date()}   // added default end date for new events
          />
        </Row>
      </div>
    );
  }
  return <p>Events Loading</p>;
}
