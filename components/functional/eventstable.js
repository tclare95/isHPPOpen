import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import useSWR from "swr";
import { fetcher } from "../../libs/fetcher";
import EventsForm from "./eventsform";

function formatDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const start = startDate ? formatter.format(new Date(startDate)) : "Unknown start";
  const end = endDate ? formatter.format(new Date(endDate)) : "Unknown end";
  return `${start} → ${end}`;
}

export default function EventsTable() {
  const { data, error, mutate, isLoading } = useSWR("/api/events?limit=99", fetcher);
  const events = useMemo(() => data?.eventsArray ?? [], [data]);
  const [selectedEventId, setSelectedEventId] = useState("new");

  useEffect(() => {
    if (selectedEventId === "new") {
      return;
    }

    const hasSelectedEvent = events.some((event) => event._id === selectedEventId);
    if (!hasSelectedEvent) {
      setSelectedEventId(events[0]?._id ?? "new");
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((event) => event._id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  async function handleSaved(savedId) {
    await mutate();
    setSelectedEventId(savedId || selectedEventId);
  }

  async function handleDeleted() {
    await mutate();
    setSelectedEventId("new");
  }

  if (isLoading) {
    return (
      <Card bg="dark" text="light" border="secondary">
        <Card.Body className="text-center py-5">
          <Spinner animation="border" role="status" className="mb-3" />
          <div>Loading events…</div>
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return <Alert variant="danger">Unable to load events right now.</Alert>;
  }

  return (
    <Row className="g-4 align-items-start">
      <Col lg={4}>
        <Card bg="dark" text="light" border="secondary" className="shadow-sm">
          <Card.Body>
            <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
              <div>
                <Card.Title className="mb-1">Events</Card.Title>
                <Card.Text className="text-secondary mb-0">Choose an event to edit or create a new one.</Card.Text>
              </div>
              <Badge bg="secondary">{events.length}</Badge>
            </Stack>

            <div className="d-grid mb-3">
              <Button variant={selectedEventId === "new" ? "primary" : "outline-light"} onClick={() => setSelectedEventId("new")}>
                + New event
              </Button>
            </div>

            {events.length === 0 ? (
              <Alert variant="secondary" className="mb-0">
                No current events. Create your first event to get started.
              </Alert>
            ) : (
              <ListGroup variant="flush">
                {events.map((event) => {
                  const isActive = event._id === selectedEventId;

                  return (
                    <ListGroup.Item
                      key={event._id}
                      action
                      active={isActive}
                      onClick={() => setSelectedEventId(event._id)}
                      className={isActive ? "border rounded" : "bg-dark text-light border-secondary rounded mb-2"}
                    >
                      <div className="fw-semibold">{event.event_name}</div>
                      <div className={isActive ? "small" : "small text-secondary"}>
                        {formatDateRange(event.event_start_date, event.event_end_date)}
                      </div>
                      <div className={isActive ? "small mt-1" : "small text-secondary mt-1"}>
                        {(event.event_details || "No details yet").slice(0, 110)}
                        {event.event_details?.length > 110 ? "…" : ""}
                      </div>
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}
          </Card.Body>
        </Card>
      </Col>

      <Col lg={8}>
        <EventsForm
          key={selectedEvent?._id ?? "new-event"}
          mode={selectedEvent ? "edit" : "create"}
          event={selectedEvent}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onCancel={() => setSelectedEventId(selectedEvent ? selectedEvent._id : "new")}
        />
      </Col>
    </Row>
  );
}
