import { Formik } from "formik";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import axios from "axios";
import { useState } from "react";
import {mutate} from "swr";

export default function EventsForm(props) {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const handleDeleteClick = (id) => {
    axios
      .delete(`/api/events/?${id}`, { withCredentials: true })
      .then((response) => {
        try {
          setSuccess(true);
          mutate("/api/events")
          // window.location.reload();
        } catch {
          setError(true);
        }
      });
  };

  const {
    id = "",
    name = "",
    startDate = new Date(),
    endDate = new Date(),
    eventDetails = "",
  } = props;
  return (
    <>
      <Formik
        enableReinitialize="true"
        initialValues={{
          id: id,
          name: name,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          eventDetails: eventDetails,
        }}
        onSubmit={(values, { setSubmitting }) => {
          const dataArray = {
            new_event_id: values.id,
            new_event_name: values.name,
            new_event_start_date: values.startDate,
            new_event_end_date: values.endDate,
            new_event_details: values.eventDetails,
          };
          const json = JSON.stringify(dataArray);
          axios
            .post("/api/events", json, { withCredentials: true })
            .then((response) => {
              if (response.status === 200) {
                setSuccess(true);
                mutate("/api/events")
                // window.location.reload();
              } else {
                setError(true);
              }
            });
        }}
      >
        {(formik) => (
          <Row className="justify-content-center text-light border-form my-1 p-4 ">
            <Form onSubmit={formik.handleSubmit} className="my-auto">
              <Form.Row>
                <Form.Label htmlFor="id">ID</Form.Label>
                <Form.Control
                  id="id"
                  name="id"
                  onChange={formik.handleChange}
                  value={formik.values.id}
                  disabled
                />
              </Form.Row>
              <Form.Row>
                <Form.Label htmlFor="name">Event Name</Form.Label>
                <Form.Control
                  id="name"
                  name="name"
                  onChange={formik.handleChange}
                  value={formik.values.name}
                />
              </Form.Row>
              <Form.Row>
                <Form.Label htmlFor="startDate">Event Start Date</Form.Label>
                <Form.Control
                  id="startDate"
                  name="startDate"
                  type="date"
                  onChange={formik.handleChange}
                  value={formik.values.startDate}
                />
              </Form.Row>
              <Form.Row>
                <Form.Label htmlFor="endDate">Event End Date</Form.Label>
                <Form.Control
                  id="endDate"
                  name="endDate"
                  type="date"
                  onChange={formik.handleChange}
                  value={formik.values.endDate}
                />
              </Form.Row>
              <Form.Row className>
                <Form.Label htmlFor="eventDetails">Event Details</Form.Label>
                <Form.Control
                  id="eventDetails"
                  name="eventDetails"
                  as="textarea"
                  onChange={formik.handleChange}
                  value={formik.values.eventDetails}
                  rows={8}
                  style={{resize: "none"}}
                />
              </Form.Row>
              <Form.Row className="my-2 mx-auto">
                <Button type="submit">
                  {formik.values.id ? "Edit Event" : "Add Event"}
                </Button>
              </Form.Row>
              <Form.Row className="my-2 mx-auto">
                <Button
                  variant="danger"
                  onClick={() => handleDeleteClick(props.id)}
                >
                  Delete Event
                </Button>
              </Form.Row>
            </Form>
           {success && <div>Event successfully modified!</div>}
           {error && <div>Error modifying event!</div>}
          </Row>
        )}
      </Formik>
     
    </>
  );
}
