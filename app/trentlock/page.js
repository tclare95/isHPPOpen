"use client";

import { Formik } from "formik";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Link from "next/link";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { useState } from "react";
import axios from "axios";

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
    <Container fluid className="bg-dark">
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Lock Levels</h1>
            <Link href="/" className="navHeader">← Back to Main Page</Link>
          </Col>
        </Row>
        <Row>
          <Col>
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
                });
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
            {success && <h5>Log successfully added!</h5>}
            {error && <div>Error adding log!</div>}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
