import { useCallback, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import useSWR from "swr";
import { adminFetcher } from "../../libs/admin/adminRequest";
import EventsForm from "./eventsform";

export const EVENT_SCOPES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "current", label: "Current" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];
const PAGE_SIZE = 20;

const TIMING_BADGES = {
  upcoming: { bg: "info", text: "dark", label: "Upcoming" },
  current: { bg: "success", text: "light", label: "Current" },
  past: { bg: "secondary", text: "light", label: "Past" },
};

// Date keys are UK calendar days; format them as days, never shifted by the browser's timezone.
const dayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDay = (key) => (key ? dayFormatter.format(new Date(`${key}T00:00:00Z`)) : "Unknown date");

export function formatDateRange(startDate, endDate) {
  if (startDate && startDate === endDate) return formatDay(startDate);
  return `${formatDay(startDate)} → ${formatDay(endDate)}`;
}

export function adminEventsKey({ scope, q, page }) {
  const params = new URLSearchParams({ scope, page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) params.set("q", q);
  return `/api/admin/events?${params.toString()}`;
}

const NEW_SELECTION = { event: null, version: 0 };

export default function EventsTable() {
  const [scope, setScope] = useState("upcoming");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState(NEW_SELECTION);
  const [notice, setNotice] = useState(null);
  const dirtyRef = useRef(false);

  const { data, error, mutate, isLoading, isValidating } = useSWR(adminEventsKey({ scope, q: query, page }), adminFetcher, {
    keepPreviousData: true,
  });
  const events = data?.events ?? [];
  const totalPages = data?.totalPages ?? 1;
  const selectedId = selection.event?.id ?? null;

  // A delete can empty the last page; step back to the last page that still has events.
  if (data && !isValidating && page > totalPages) {
    setPage(totalPages);
  }

  const handleDirtyChange = useCallback((dirty) => {
    dirtyRef.current = dirty;
  }, []);

  function select(event) {
    if ((event?.id ?? null) === selectedId && event) return;
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes to this event?")) return;
    dirtyRef.current = false;
    setNotice(null);
    setSelection((current) => ({ event, version: current.version + 1 }));
  }

  function changeScope(nextScope) {
    setScope(nextScope);
    setPage(1);
  }

  function submitSearch(submitEvent) {
    submitEvent.preventDefault();
    setQuery(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput("");
    setQuery("");
    setPage(1);
  }

  async function handleSaved(savedEvent, message) {
    dirtyRef.current = false;
    setSelection((current) => ({ event: savedEvent ?? current.event, version: current.version + 1 }));
    setNotice({ type: "success", message });
    await mutate();
  }

  async function handleDeleted(_id, name) {
    dirtyRef.current = false;
    setSelection((current) => ({ event: null, version: current.version + 1 }));
    setNotice({ type: "success", message: `Deleted “${name || "event"}”.` });
    await mutate();
  }

  const scopeLabel = EVENT_SCOPES.find((option) => option.value === scope)?.label.toLowerCase();

  return (
    <Row className="g-4 align-items-start">
      <Col lg={5} xl={4}>
        <Card bg="dark" text="light" border="secondary" className="shadow-sm">
          <Card.Body>
            <Stack direction="horizontal" className="justify-content-between align-items-center mb-3">
              <div>
                <Card.Title as="h2" className="h5 mb-1">Events</Card.Title>
                <Card.Text className="text-secondary mb-0">Find any past, current or future event to edit.</Card.Text>
              </div>
              {data ? <Badge bg="secondary" aria-label={`${data.total} matching events`}>{data.total}</Badge> : null}
            </Stack>

            <div className="d-grid mb-3">
              <Button variant={selectedId ? "outline-light" : "primary"} onClick={() => select(null)}>
                + New event
              </Button>
            </div>

            <ButtonGroup aria-label="Event timing" className="w-100 mb-2">
              {EVENT_SCOPES.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={scope === option.value ? "light" : "outline-light"}
                  aria-pressed={scope === option.value}
                  onClick={() => changeScope(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </ButtonGroup>

            <Form onSubmit={submitSearch} role="search" className="mb-3">
              <InputGroup size="sm">
                <Form.Control
                  aria-label="Search events"
                  placeholder="Search name or details"
                  value={searchInput}
                  maxLength={100}
                  onChange={(changeEvent) => setSearchInput(changeEvent.target.value)}
                />
                <Button type="submit" variant="outline-light">Search</Button>
                {query ? <Button variant="outline-secondary" onClick={clearSearch}>Clear</Button> : null}
              </InputGroup>
            </Form>

            {error ? (
              <Alert variant="danger" className="mb-0">
                <div className="mb-2">{error.message || "Unable to load events right now."}</div>
                <Button size="sm" variant="outline-light" onClick={() => mutate()}>Retry</Button>
              </Alert>
            ) : isLoading && !data ? (
              <div className="text-center py-4">
                <Spinner animation="border" role="status" size="sm" className="me-2" />
                Loading events…
              </div>
            ) : events.length === 0 ? (
              <Alert variant="secondary" className="mb-0">
                {query ? `No ${scope === "all" ? "" : `${scopeLabel} `}events match “${query}”.` : `No ${scope === "all" ? "" : `${scopeLabel} `}events.`}
              </Alert>
            ) : (
              <ListGroup variant="flush" aria-busy={isValidating}>
                {events.map((event) => {
                  const isActive = event.id === selectedId;
                  const badge = TIMING_BADGES[event.timing];

                  return (
                    <ListGroup.Item
                      key={event.id}
                      action
                      active={isActive}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => select(event)}
                      className={isActive ? "border rounded mb-2" : "bg-dark text-light border-secondary rounded mb-2"}
                    >
                      <Stack direction="horizontal" gap={2} className="justify-content-between align-items-start">
                        <span className="fw-semibold">{event.name || "Untitled event"}</span>
                        {badge ? <Badge bg={badge.bg} text={badge.text}>{badge.label}</Badge> : null}
                      </Stack>
                      <div className={isActive ? "small" : "small text-secondary"}>
                        {formatDateRange(event.startDate, event.endDate)}
                      </div>
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}

            {data && data.total > 0 ? (
              <Stack direction="horizontal" gap={2} className="justify-content-between align-items-center mt-3">
                <Button size="sm" variant="outline-light" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <span className="small text-secondary">Page {data.page} of {totalPages}</span>
                <Button size="sm" variant="outline-light" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next
                </Button>
              </Stack>
            ) : null}
          </Card.Body>
        </Card>
      </Col>

      <Col lg={7} xl={8}>
        {notice ? (
          <Alert variant={notice.type} role="status" className="mb-3" onClose={() => setNotice(null)} dismissible>
            {notice.message}
          </Alert>
        ) : null}
        <EventsForm
          key={`${selectedId ?? "new"}:${selection.version}`}
          event={selection.event}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onCancel={() => select(null)}
          onDirtyChange={handleDirtyChange}
        />
      </Col>
    </Row>
  );
}
