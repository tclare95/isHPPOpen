"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";

export default function AlertManagementAccess({ compact = false }) {
  const [email, setEmail] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event?.preventDefault?.();
    setIsSubmitting(true);
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/alerts/manage-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error?.message || "Unable to send a management link right now.");
      }

      setSuccessMessage(payload?.data?.message || "Check your email for a management link.");
      setEmail("");
    } catch (error) {
      setErrorMessage(error.message || "Unable to send a management link right now.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCompactKeyDown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleSubmit();
  }

  const content = (
    <Stack gap={2}>
      {!compact ? (
        <div className="text-secondary">
          Enter your email and we&apos;ll send you a secure link to manage your Colwick alerts.
        </div>
      ) : null}

      {successMessage ? <Alert variant="success" className="mb-0">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="danger" className="mb-0">{errorMessage}</Alert> : null}

      <Form.Group controlId={compact ? "manage-alert-email-compact" : "manage-alert-email"}>
        <Form.Label className="small text-uppercase text-secondary mb-1">Email</Form.Label>
        <Form.Control
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={compact ? handleCompactKeyDown : undefined}
          placeholder="you@example.com"
          required={!compact}
        />
      </Form.Group>

      <div className="d-grid">
        <Button
          type={compact ? "button" : "submit"}
          variant={compact ? "outline-light" : "primary"}
          disabled={isSubmitting}
          onClick={compact ? () => handleSubmit() : undefined}
        >
          {isSubmitting ? "Sending link…" : "Email me a management link"}
        </Button>
      </div>
    </Stack>
  );

  if (compact) {
    return <div className="text-start">{content}</div>;
  }

  return (
    <Form onSubmit={handleSubmit} className="text-start">
      {content}
    </Form>
  );
}

AlertManagementAccess.propTypes = {
  compact: PropTypes.bool,
};