"use client";

import PropTypes from "prop-types";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";

function formatSource(source) {
  return source === "forecast" ? "Forecast" : "Live";
}

function formatDirection(direction) {
  return direction === "below" ? "Below" : "Above";
}

function formatStatus(status) {
  if (status === "pending_confirmation") {
    return { label: "Pending confirmation", variant: "warning" };
  }

  return { label: "Active", variant: "success" };
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString("en-GB");
}

function AlertRow({ alert, busyAlertKey, onRemove }) {
  const status = formatStatus(alert.status);

  return (
    <Card bg="black" text="light" border="secondary">
      <Card.Body>
        <Stack direction="horizontal" className="justify-content-between align-items-start gap-3 flex-wrap mb-3">
          <div>
            <div className="fw-semibold mb-1">{alert.gaugeName}</div>
            <div className="text-secondary small">
              {formatSource(alert.source)} • {formatDirection(alert.direction)} {Number(alert.threshold).toFixed(2)} m
            </div>
          </div>
          <Badge bg={status.variant}>{status.label}</Badge>
        </Stack>

        <div className="small text-secondary mb-3">
          Created: {formatDate(alert.createdAt)}<br />
          Last updated: {formatDate(alert.updatedAt)}<br />
          Last triggered: {formatDate(alert.lastTriggeredAt)}
        </div>

        <div className="d-grid d-sm-flex justify-content-sm-end">
          <Button
            variant="outline-danger"
            onClick={() => onRemove(alert.alertKey)}
            disabled={busyAlertKey === alert.alertKey}
          >
            {busyAlertKey === alert.alertKey ? "Removing…" : "Remove alert"}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

AlertRow.propTypes = {
  alert: PropTypes.shape({
    alertKey: PropTypes.string.isRequired,
    gaugeName: PropTypes.string.isRequired,
    source: PropTypes.string.isRequired,
    direction: PropTypes.string.isRequired,
    threshold: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    createdAt: PropTypes.string,
    updatedAt: PropTypes.string,
    lastTriggeredAt: PropTypes.string,
  }).isRequired,
  busyAlertKey: PropTypes.string.isRequired,
  onRemove: PropTypes.func.isRequired,
};

export function AlertsManagementFeedback({ successMessage, errorMessage }) {
  return (
    <>
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}
    </>
  );
}

AlertsManagementFeedback.propTypes = {
  successMessage: PropTypes.string.isRequired,
  errorMessage: PropTypes.string.isRequired,
};

export function AlertsManagementContent({ data, error, isPending, busyAlertKey, onRemove }) {
  if (isPending) {
    return <div className="text-center py-4"><Spinner animation="border" role="status" /></div>;
  }

  if (error) {
    return <Alert variant="danger">{error.message || "Unable to load your alerts right now."}</Alert>;
  }

  if (data?.alerts?.length === 0) {
    return <Alert variant="secondary">No active or pending Colwick alerts were found for this email address.</Alert>;
  }

  if (!data?.alerts?.length) {
    return null;
  }

  return (
    <Stack gap={3}>
      {data.alerts.map((alert) => (
        <AlertRow key={alert.alertKey} alert={alert} busyAlertKey={busyAlertKey} onRemove={onRemove} />
      ))}
    </Stack>
  );
}

AlertsManagementContent.propTypes = {
  data: PropTypes.shape({
    alerts: PropTypes.arrayOf(AlertRow.propTypes.alert),
  }),
  error: PropTypes.shape({
    message: PropTypes.string,
  }),
  isPending: PropTypes.bool.isRequired,
  busyAlertKey: PropTypes.string.isRequired,
  onRemove: PropTypes.func.isRequired,
};
