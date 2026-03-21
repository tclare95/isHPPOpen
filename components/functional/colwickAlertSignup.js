"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";

const INITIAL_FORM = {
  email: "",
  threshold: "1.50",
  source: "live",
  direction: "above",
};

export default function ColwickAlertSignup({ gaugeKey, gaugeName, forecastAvailable = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(INITIAL_FORM);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field, value) {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formState.email,
          threshold: Number(formState.threshold),
          source: formState.source,
          direction: formState.direction,
          gaugeKey,
        }),
      });

      const payload = await response.json();

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || "Unable to save alert right now.");
      }

      setSuccessMessage(payload?.data?.message || `Check your email to confirm this ${gaugeName} alert.`);
      setFormState((current) => ({ ...current, email: "" }));
    } catch (error) {
      setErrorMessage(error.message || "Unable to save alert right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-top border-secondary">
      <div className="d-grid gap-2">
        <Button variant={isOpen ? "info" : "outline-info"} onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? "Hide email alerts" : "Email alerts"}
        </Button>
      </div>

      {isOpen ? (
        <Form className="mt-3 text-start" onSubmit={handleSubmit}>
          <Stack gap={2}>
            <div className="small text-secondary">
              Set a Colwick alert by email. Forecast alerts use the Colwick S3 forecast.
            </div>
            {successMessage ? <Alert variant="success" className="mb-0">{successMessage}</Alert> : null}
            {errorMessage ? <Alert variant="danger" className="mb-0">{errorMessage}</Alert> : null}

            <Form.Group controlId={`alert-email-${gaugeKey}`}>
              <Form.Label className="small text-uppercase text-secondary mb-1">Email</Form.Label>
              <Form.Control
                type="email"
                value={formState.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
                placeholder="you@example.com"
              />
            </Form.Group>

            <Form.Group controlId={`alert-threshold-${gaugeKey}`}>
              <Form.Label className="small text-uppercase text-secondary mb-1">Threshold (m)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={formState.threshold}
                onChange={(event) => updateField("threshold", event.target.value)}
                required
              />
            </Form.Group>

            <Form.Group controlId={`alert-source-${gaugeKey}`}>
              <Form.Label className="small text-uppercase text-secondary mb-1">Alert type</Form.Label>
              <Form.Select value={formState.source} onChange={(event) => updateField("source", event.target.value)}>
                <option value="live">Live level crossing</option>
                {forecastAvailable ? <option value="forecast">Forecast crossing</option> : null}
              </Form.Select>
            </Form.Group>

            <Form.Group controlId={`alert-direction-${gaugeKey}`}>
              <Form.Label className="small text-uppercase text-secondary mb-1">Trigger when level</Form.Label>
              <Form.Select value={formState.direction} onChange={(event) => updateField("direction", event.target.value)}>
                <option value="above">Rises to or above threshold</option>
                <option value="below">Drops to or below threshold</option>
              </Form.Select>
            </Form.Group>

            <div className="d-grid">
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? "Saving alert…" : "Save Colwick alert"}
              </Button>
            </div>
          </Stack>
        </Form>
      ) : null}
    </div>
  );
}

ColwickAlertSignup.propTypes = {
  gaugeKey: PropTypes.string.isRequired,
  gaugeName: PropTypes.string.isRequired,
  forecastAvailable: PropTypes.bool,
};