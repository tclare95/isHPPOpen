import { useEffect, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Stack from "react-bootstrap/Stack";
import * as Yup from "yup";
import { adminRequest } from "../../libs/admin/adminRequest";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const validationSchema = Yup.object({
  name: Yup.string().trim().required("Event name is required").max(200, "Event name must be 200 characters or fewer"),
  startDate: Yup.string().required("Start date is required").matches(DATE_ONLY, "Start date must be a valid date"),
  endDate: Yup.string()
    .required("End date is required")
    .matches(DATE_ONLY, "End date must be a valid date")
    // Date-only strings compare correctly as text.
    .test("end-after-start", "End date can’t be before start date", function validateEnd(value) {
      const { startDate } = this.parent;
      return !value || !startDate || !DATE_ONLY.test(startDate) || value >= startDate;
    }),
  details: Yup.string().trim().required("Event details are required"),
});

/** Today's UK calendar date as `YYYY-MM-DD`, the default for a new event. */
export function todayDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function buildInitialValues(event) {
  const today = todayDateKey();
  return {
    name: event?.name ?? "",
    startDate: event?.startDate || today,
    endDate: event?.endDate || event?.startDate || today,
    details: event?.details ?? "",
  };
}

function normalizeValidationError(error) {
  if (!error?.inner) {
    return {};
  }

  return error.inner.reduce((accumulator, currentError) => {
    if (currentError.path && !accumulator[currentError.path]) {
      accumulator[currentError.path] = currentError.message;
    }

    return accumulator;
  }, {});
}

/**
 * Create or edit one event. `event` (from /api/admin/events) selects edit mode by its stable id;
 * without it the form only ever creates a new event. Failed saves keep the typed values.
 * The parent remounts the form (via `key`) to load a different or freshly saved event.
 */
export default function EventsForm({ event, onSaved, onDeleted, onCancel, onDirtyChange }) {
  const initialValues = useMemo(() => buildInitialValues(event), [event]);
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const eventId = event?.id || null;
  const isEditing = Boolean(eventId);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  async function validateForm(nextValues = values) {
    try {
      await validationSchema.validate(nextValues, { abortEarly: false });
      setErrors({});
      return {};
    } catch (error) {
      const nextErrors = normalizeValidationError(error);
      setErrors(nextErrors);
      return nextErrors;
    }
  }

  function updateValue(field, nextValue) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: nextValue,
    }));
    setStatus(null);
  }

  async function handleBlur(field) {
    setTouched((currentTouched) => ({
      ...currentTouched,
      [field]: true,
    }));
    await validateForm();
  }

  function resetForm() {
    setValues(initialValues);
    setTouched({});
    setErrors({});
    setStatus(null);
    setShowDeleteConfirm(false);
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();
    setStatus(null);
    setTouched({ name: true, startDate: true, endDate: true, details: true });

    const nextErrors = await validateForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ type: "danger", message: "Fix the highlighted fields before saving." });
      return;
    }

    setIsSubmitting(true);
    const body = {
      name: values.name.trim(),
      startDate: values.startDate,
      endDate: values.endDate,
      details: values.details.trim(),
    };

    let result;
    try {
      result = await adminRequest(
        isEditing ? `/api/admin/events/${encodeURIComponent(eventId)}` : "/api/admin/events",
        { method: isEditing ? "PUT" : "POST", body, fallback: "Unable to save the event." },
      );
    } catch (error) {
      // Nothing was saved: keep everything the editor typed.
      setStatus({ type: "danger", message: `Not saved. ${error.message}` });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    const message = isEditing
      ? result?.changed === false ? "No changes to save." : "Event updated."
      : "Event created.";
    if (onSaved) {
      await onSaved(result?.event ?? null, message);
    } else {
      setStatus({ type: "success", message });
    }
  }

  async function handleDelete() {
    if (!eventId) {
      return;
    }

    setIsDeleting(true);
    setStatus(null);

    try {
      await adminRequest(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        fallback: "Unable to delete the event.",
      });
    } catch (error) {
      setStatus({ type: "danger", message: `Not deleted. ${error.message}` });
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    setShowDeleteConfirm(false);
    if (onDeleted) {
      await onDeleted(eventId, event?.name);
    } else {
      setStatus({ type: "success", message: "Event deleted." });
    }
  }

  return (
    <Card bg="dark" text="light" border="secondary" className="shadow-sm">
      <Card.Body>
        <Stack direction="horizontal" className="justify-content-between align-items-start mb-3 gap-3">
          <div>
            <Card.Title as="h2" className="h5 mb-1">
              {isEditing ? `Editing “${event.name || "Untitled event"}”` : "New event"}
            </Card.Title>
            <Card.Text className="text-secondary mb-0">
              {isEditing
                ? "Changes apply to this saved event only."
                : "Creates a separate event, even if another event has the same name."}
            </Card.Text>
          </div>
          <Badge bg={isDirty ? "warning" : "secondary"} text={isDirty ? "dark" : "light"}>
            {isDirty ? "Unsaved changes" : isEditing ? "Saved" : "Not saved yet"}
          </Badge>
        </Stack>

        {status ? (
          <Alert variant={status.type} className="mb-3" role={status.type === "danger" ? "alert" : "status"}>
            {status.message}
          </Alert>
        ) : null}

        {showDeleteConfirm ? (
          <Alert variant="warning" className="mb-3">
            <div className="fw-semibold mb-2">Delete “{event?.name}” permanently?</div>
            <div className="small mb-3">It will be removed from the public site. This cannot be undone.</div>
            <Stack direction="horizontal" gap={2}>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button variant="outline-light" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Keep event
              </Button>
            </Stack>
          </Alert>
        ) : null}

        <Form onSubmit={handleSubmit} noValidate>
          <Row className="g-3">
            <Col xs={12}>
              <Form.Label htmlFor="name">Event name</Form.Label>
              <Form.Control
                id="name"
                value={values.name}
                onChange={(changeEvent) => updateValue("name", changeEvent.target.value)}
                onBlur={() => handleBlur("name")}
                isInvalid={Boolean(touched.name && errors.name)}
                placeholder="National Slalom Race"
              />
              <Form.Control.Feedback type="invalid">{errors.name}</Form.Control.Feedback>
            </Col>

            <Col md={6}>
              <Form.Label htmlFor="startDate">Start date</Form.Label>
              <Form.Control
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(changeEvent) => updateValue("startDate", changeEvent.target.value)}
                onBlur={() => handleBlur("startDate")}
                isInvalid={Boolean(touched.startDate && errors.startDate)}
              />
              <Form.Control.Feedback type="invalid">{errors.startDate}</Form.Control.Feedback>
            </Col>

            <Col md={6}>
              <Form.Label htmlFor="endDate">End date</Form.Label>
              <Form.Control
                id="endDate"
                type="date"
                value={values.endDate}
                min={values.startDate || undefined}
                onChange={(changeEvent) => updateValue("endDate", changeEvent.target.value)}
                onBlur={() => handleBlur("endDate")}
                isInvalid={Boolean(touched.endDate && errors.endDate)}
              />
              <Form.Control.Feedback type="invalid">{errors.endDate}</Form.Control.Feedback>
            </Col>

            <Col xs={12}>
              <Form.Text className="text-secondary">Dates are whole UK days; an event runs to the end of its end date.</Form.Text>
            </Col>

            <Col xs={12}>
              <Form.Label htmlFor="details">Public details</Form.Label>
              <Form.Control
                id="details"
                as="textarea"
                rows={8}
                value={values.details}
                onChange={(changeEvent) => updateValue("details", changeEvent.target.value)}
                onBlur={() => handleBlur("details")}
                isInvalid={Boolean(touched.details && errors.details)}
                placeholder="Summarise the event, timings, restrictions, or anything visitors should know."
              />
              <Form.Control.Feedback type="invalid">{errors.details}</Form.Control.Feedback>
            </Col>
          </Row>

          <Stack direction="horizontal" gap={2} className="mt-4 flex-wrap">
            <Button type="submit" disabled={isSubmitting || isDeleting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save changes" : "Create event"}
            </Button>
            <Button variant="outline-light" type="button" onClick={resetForm} disabled={isSubmitting || isDeleting || !isDirty}>
              Reset
            </Button>
            {onCancel && isEditing ? (
              <Button variant="outline-secondary" type="button" onClick={onCancel} disabled={isSubmitting || isDeleting}>
                Close
              </Button>
            ) : null}
            {isEditing ? (
              <Button
                variant="outline-danger"
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isSubmitting || isDeleting}
                className="ms-md-auto"
              >
                Delete event
              </Button>
            ) : null}
          </Stack>
        </Form>
      </Card.Body>
    </Card>
  );
}
