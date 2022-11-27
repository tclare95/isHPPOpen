import { Formik } from "formik";
import Container from "react-bootstrap/Container";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import Header from "../components/layout/frontpage/header";
import Meta from "../components/meta";
import Link from "next/link";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { useState } from "react";
import axios from "axios";

const validate = (values) => {
    const errors = {};
    if (!values.dateTime) {
        errors.dateTime = "Required";
    }
    if (!values.range) {
        errors.range = "Required";
    }
    
    return errors;
};

export default function TrentLock() {
    
  const now = new Date();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);
  return (
    <Container fluid className="bg-dark">
      <Meta title="Trent Lock Info Gathering - Is HPP Open" />
      <Container className="text-white text-center">
        <Row className="mb-5">
          <Col>
            <h1>Trent Lock Levels</h1>
            <Link href="/">
              <h3 className="navHeader">← Back to Main Page</h3>
            </Link>
            <p>
              This page will gather information about trent lock levels to
              produce a better forecast model. This is a work in progress and
              will be updated as more information is gathered.
            </p>
            <p>
              If you paddle at Trent lock, please consider filling out this form
              to help us improve our forecast model. I'll correlate the data of
              when you paddle with the river levels to produce a better forecast
              model.
            </p>
            <p>You can also add comments with more info if you want</p>
          </Col>
        </Row>
        <Row>
          <Col>
            <h4>Enter your info here</h4>
          </Col>
        </Row>
        <Row>
          <Col>
            <Formik
            validate={validate}
             initialValues={{
                range: 3,
             }}
              onSubmit={(values, { setSubmitting, resetForm }) => {
                console.log(values);
                const dataArray = {
                  dateTime: values.dateTime,
                  range: values.range,
                  comments: values.comments ? values.comments : "No comment",
                  boatType: values.boatType? values.boatType : "No boat type",
                };
                const json = JSON.stringify(dataArray);
                console.log(json);
                axios
                  .post("/api/trentlockapi", json)
                  .then((response) => {
                    if (response.status === 200) {
                      setSuccess(true);
                    } else {
                      setError(true);
                    }
                  });
                // don't reset the form - in case they want to add another event
                // resetForm();
              }}
            >
              {(formik) => (
                <Form onSubmit={formik.handleSubmit}>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="dateTime">
                      Date / Time of paddle
                    </Form.Label>
                    <Form.Control
                      name="dateTime"
                      type="datetime-local"
                      id="dateTime"
                      onChange={formik.handleChange}
                    ></Form.Control>
                    {formik.errors.dateTime ? (<p className="text-danger">please fill in the date / time - it doesn't need to be exact!</p>): null}
                    <Form.Label htmlFor="rating">
                      Wave rating out of 5 (1 = not paddleable, 5 = amazing)
                    </Form.Label>
                    <Form.Range
                      min="1"
                      max="5"
                      id="range"
                      onChange={formik.handleChange}
                      name="range"
                    />
                    {formik.errors.range ? (<p className="text-danger">please fill in the range!</p>) : null}
                    <p>{formik.values.range}</p>
                    <Form.Label htmlFor="comments">
                      Any comments on the level (optional)
                    </Form.Label>
                    <Form.Control
                      id="comments"
                      type="text"
                      placeholder="Comments"
                      onChange={formik.handleChange}
                      name="comments"
                    />
                    <Form.Label htmlFor="boatType">
                      What kind of boat? (optional)
                    </Form.Label>
                    <Form.Select
                      id="boatType"
                      onChange={formik.handleChange}
                      name="boatType"
                    >
                      <option>playboat</option>
                      <option>longer boat</option>
                      <option>surf boat</option>
                      <option>sup</option>
                    </Form.Select>

                    <Button variant="primary" type="submit">
                      Submit
                    </Button>
                  </Form.Group>
                </Form>
              )}
            </Formik>
            {success && (
              <div>
                <h5>Log successfully added!</h5>
              </div>
            )}
            {error && <div>Error adding log!</div>}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
