"use client";

import { Formik } from "formik";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { useState } from "react";
import axios from "axios";
import PageHeader from "../../components/layout/site/PageHeader";
import StatusMessage from "../../components/layout/site/StatusMessage";

const validate = (values) => {
  const errors = {};
  if (!values.dateTime) errors.dateTime = "Required";
  if (!values.range) errors.range = "Required";
  return errors;
};

export default function TrentLockPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  return (
    <Container fluid as="main" className="history-page text-white">
      <Container className="py-4 py-lg-5">
        <PageHeader title="Log a Trent Lock session" lead="Record the wave conditions you found at Trent Lock." />
        <Row>
          <Col lg={8} xl={6}>
            <Formik
              validate={validate}
              initialValues={{ range: 3 }}
              onSubmit={(values) => {
                const dataArray = {
                  dateTime: values.dateTime,
                  range: values.range,
                  comments: values.comments ? values.comments : "No comment",
                  boatType: values.boatType ? values.boatType : "No boat type",
                };
                axios.post("/api/trentlockapi", JSON.stringify(dataArray)).then((response) => {
                  if (response.status === 200) setSuccess(true);
                  else setError(true);
                }).catch(() => setError(true));
              }}
            >
              {(formik) => (
                <Form onSubmit={formik.handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="dateTime">Date / Time of paddle</Form.Label>
                    <Form.Control name="dateTime" type="datetime-local" id="dateTime" onChange={formik.handleChange} />
                    <Form.Label htmlFor="rating">Wave rating out of 5</Form.Label>
                    <Form.Range min="1" max="5" id="range" onChange={formik.handleChange} name="range" />
                    <p>{formik.values.range}</p>
                    <Form.Label htmlFor="comments">Comments</Form.Label>
                    <Form.Control id="comments" type="text" onChange={formik.handleChange} name="comments" />
                    <Form.Label htmlFor="boatType">Boat type</Form.Label>
                    <Form.Select id="boatType" onChange={formik.handleChange} name="boatType">
                      <option>playboat</option><option>longer boat</option><option>surf boat</option><option>sup</option>
                    </Form.Select>
                    <Button variant="primary" type="submit">Submit</Button>
                  </Form.Group>
                </Form>
              )}
            </Formik>
            {success && <p className="mt-3 fw-semibold" role="status">Log added. Thank you.</p>}
            {error && <StatusMessage state="error" className="mt-3">The log could not be saved. Please try again.</StatusMessage>}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
