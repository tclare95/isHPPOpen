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

const validationSchema = Yup.object({
  name: Yup.string().trim().required("Event name is required"),
  startDate: Yup.date().required("Start date is required"),
  endDate: Yup.date()
    .required("End date is required")
    .min(Yup.ref("startDate"), "End date can’t be before start date"),
  eventDetails: Yup.string().trim().required("Event details are required"),
});

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().split("T")[0];
}

function buildInitialValues(event) {
  const today = formatDateInput(new Date());

  return {
    id: event?.id ?? event?._id ?? "",
    name: event?.name ?? event?.event_name ?? "",
    startDate: formatDateInput(event?.startDate ?? event?.event_start_date) || today,
    endDate: formatDateInput(event?.endDate ?? event?.event_end_date) || today,
    eventDetails: event?.eventDetails ?? event?.event_details ?? "",
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

export default function EventsForm({
  event,
  mode = "create",
  onSaved,
  onDeleted,
  onCancel,
}) {
  const initialValues = useMemo(() => buildInitialValues(event), [event]);
  const [values, setValues] = useState(initialValues);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setValues(initialValues);
    setTouched({});
    setErrors({});
    setStatus(null);
    setShowDeleteConfirm(false);
  }, [initialValues]);

  const hasExistingEvent = Boolean(initialValues.id);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);

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

    const nextTouched = {
      name: true,
      startDate: true,
      endDate: true,
      eventDetails: true,
    };

    setTouched(nextTouched);

    const nextErrors = await validateForm(values);
    if (Object.keys(nextErrors).length > 0) {
      setStatus({ type: "danger", message: "Fix the highlighted fields before saving." });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          new_event_id: values.id || undefined,
          new_event_name: values.name.trim(),
          new_event_start_date: values.startDate,
          new_event_end_date: values.endDate,
          new_event_details: values.eventDetails.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || payload?.message || "Unable to save event.");
      }

      setStatus({
        type: "success",
        message: values.id ? "Event updated successfully." : "Event created successfully.",
      });

      if (onSaved) {
        await onSaved(payload?.data?.id || values.id || null);
      }
    } catch (error) {
      setStatus({
        type: "danger",
        message: error.message || "Unable to save event.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!values.id) {
      return;
    }

    setIsDeleting(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/events?id=${encodeURIComponent(values.id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || payload?.message || "Unable to delete event.");
      }

      setShowDeleteConfirm(false);
      setStatus({ type: "success", message: "Event deleted." });

      if (onDeleted) {
        await onDeleted(values.id);
      }
    } catch (error) {
      setStatus({
        type: "danger",
        message: error.message || "Unable to delete event.",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card bg="dark" text="light" border="secondary" className="shadow-sm">
      <Card.Body>
        <Stack direction="horizontal" className="justify-content-between align-items-start mb-3 gap-3">
          <div>
            <Card.Title className="mb-1">
              {mode === "edit" ? "Edit event" : "Create event"}
            </Card.Title>
            <Card.Text className="text-secondary mb-0">
              {mode === "edit"
                ? "Update the selected event and save when you are ready."
                : "Add a new event with dates and public-facing details."}
            </Card.Text>
          </div>
          <Badge bg={isDirty ? "warning" : "secondary"} text={isDirty ? "dark" : "light"}>
            {isDirty ? "Unsaved changes" : "Saved state"}
          </Badge>
        </Stack>

        {status ? (
          <Alert variant={status.type} className="mb-3">
            {status.message}
          </Alert>
        ) : null}

        {showDeleteConfirm ? (
          <Alert variant="warning" className="mb-3">
            <div className="fw-semibold mb-2">Delete this event permanently?</div>
            <div className="small mb-3">This cannot be undone.</div>
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
                onChange={(changeEvent) => updateValue("endDate", changeEvent.target.value)}
                onBlur={() => handleBlur("endDate")}
                isInvalid={Boolean(touched.endDate && errors.endDate)}
              />
              <Form.Control.Feedback type="invalid">{errors.endDate}</Form.Control.Feedback>
            </Col>

            <Col xs={12}>
              <Form.Label htmlFor="eventDetails">Public details</Form.Label>
              <Form.Control
                id="eventDetails"
                as="textarea"
                rows={8}
                value={values.eventDetails}
                onChange={(changeEvent) => updateValue("eventDetails", changeEvent.target.value)}
                onBlur={() => handleBlur("eventDetails")}
                isInvalid={Boolean(touched.eventDetails && errors.eventDetails)}
                placeholder="Summarise the event, timings, restrictions, or anything visitors should know."
              />
              <Form.Control.Feedback type="invalid">{errors.eventDetails}</Form.Control.Feedback>
            </Col>
          </Row>

          <Stack direction="horizontal" gap={2} className="mt-4 flex-wrap">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create event"}
            </Button>
            <Button variant="outline-light" type="button" onClick={resetForm} disabled={isSubmitting || isDeleting || !isDirty}>
              Reset
            </Button>
            {onCancel ? (
              <Button variant="outline-secondary" type="button" onClick={onCancel} disabled={isSubmitting || isDeleting}>
                Cancel
              </Button>
            ) : null}
            {hasExistingEvent ? (
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
