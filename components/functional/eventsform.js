import { Formik } from "formik";
import * as Yup from "yup"; // added Yup for validation
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import axios from "axios";
import { useState } from "react";
import { mutate } from "swr";

// Validation schema using Yup
const validationSchema = Yup.object().shape({
  name: Yup.string().required("Event name is required"),
  startDate: Yup.date().required("Start date is required"),
  endDate: Yup.date()
    .required("End date is required")
    .min(Yup.ref("startDate"), "End date can’t be before start date"),
  eventDetails: Yup.string().required("Event details are required"),
});

export default function EventsForm({ id, name, startDate, endDate, eventDetails, isNew, mutate }) {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [deleteState, setDeleteState] = useState(false);

  // Updated delete handler: uses the proper event id from props.
  const handleDelete = async () => {
    try {
      await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (mutate) mutate();
    } catch (err) {
      console.error("Failed to delete event", err);
    }
  };

  return (
      <Formik
        enableReinitialize={true}
        initialValues={{
          id: id,
          name: name,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          eventDetails: eventDetails,
        }}
        validationSchema={validationSchema}
        onSubmit={async (values, { setSubmitting, resetForm }) => {
          const dataArray = {
            new_event_id: values.id,
            new_event_name: values.name,
            new_event_start_date: values.startDate,
            new_event_end_date: values.endDate,
            new_event_details: values.eventDetails,
          };
          try {
            const response = await axios.post("/api/events", JSON.stringify(dataArray), { withCredentials: true });
            if (response.status === 200) {
              setSuccess(true);
              // Revalidate events data so the table reflects the update
              // Passing no arguments uses the bound mutate from useSWR
              // which will refetch the data for the current key
              mutate();
            } else {
              setError("Error modifying event!");
            }
          } catch (err) {
            setError("Error modifying event!");
          }
          resetForm();
          setSubmitting(false);
        }}
      >
        {(formik) => (
          <Row className="justify-content-center text-light border-form my-1 p-4 ">
            <Form onSubmit={formik.handleSubmit} className="my-auto">
              <Row>
                <Form.Label htmlFor="id">ID</Form.Label>
                <Form.Control
                  id="id"
                  name="id"
                  onChange={formik.handleChange}
                  value={formik.values.id}
                  disabled
                />
              </Row>
              <Row>
                <Form.Label htmlFor="name">Event Name</Form.Label>
                <Form.Control
                  id="name"
                  name="name"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.name}
                  isInvalid={!!formik.errors.name && formik.touched.name}
                />
                {formik.touched.name && formik.errors.name && (
                  <Form.Control.Feedback type="invalid">
                    {formik.errors.name}
                  </Form.Control.Feedback>
                )}
              </Row>
              <Row>
                <Form.Label htmlFor="startDate">Event Start Date</Form.Label>
                <Form.Control
                  id="startDate"
                  name="startDate"
                  type="date"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.startDate}
                  isInvalid={!!formik.errors.startDate && formik.touched.startDate}
                />
                {formik.touched.startDate && formik.errors.startDate && (
                  <Form.Control.Feedback type="invalid">
                    {formik.errors.startDate}
                  </Form.Control.Feedback>
                )}
              </Row>
              <Row>
                <Form.Label htmlFor="endDate">Event End Date</Form.Label>
                <Form.Control
                  id="endDate"
                  name="endDate"
                  type="date"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.endDate}
                  isInvalid={!!formik.errors.endDate && formik.touched.endDate}
                />
                {formik.touched.endDate && formik.errors.endDate && (
                  <Form.Control.Feedback type="invalid">
                    {formik.errors.endDate}
                  </Form.Control.Feedback>
                )}
              </Row>
              <Row>
                <Form.Label htmlFor="eventDetails">Event Details</Form.Label>
                <Form.Control
                  id="eventDetails"
                  name="eventDetails"
                  as="textarea"
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  value={formik.values.eventDetails}
                  isInvalid={!!formik.errors.eventDetails && formik.touched.eventDetails}
                  rows={8}
                  style={{ resize: "none" }}
                />
                {formik.touched.eventDetails && formik.errors.eventDetails && (
                  <Form.Control.Feedback type="invalid">
                    {formik.errors.eventDetails}
                  </Form.Control.Feedback>
                )}
              </Row>
              <Row className="my-2 mx-auto">
                <Button type="submit" disabled={formik.isSubmitting || !formik.isValid}>
                  {formik.values.id ? "Save Edit" : "Add Event"}
                </Button>
              </Row>
              <Row className="my-2 mx-auto">
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  disabled={!isNew}
                >
                  {isNew ? "Delete Event" : "N/A"}
                  {deleteState ? " - Click again to confirm" : ""}
                </Button>
              </Row>
            </Form>
            {success && (
              <div>
                <h5>Event successfully modified!</h5>
              </div>
            )}
            {error && <div className="text-danger">{error}</div>}
          </Row>
        )}
      </Formik>
  );
}
