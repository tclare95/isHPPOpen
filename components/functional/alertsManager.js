"use client";

import PropTypes from "prop-types";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import StatusMessage from "../layout/site/StatusMessage";
import Stack from "react-bootstrap/Stack";

function formatSource(source) {
  return source === "forecast" ? "Forecast" : "Live";
}

function formatDirection(direction) {
  return direction === "below" ? "Below" : "Above";
}

function formatStatus(alert) {
  if (alert.status === "pending_confirmation") {
    return alert.confirmationExpired
      ? { label: "Not active: confirmation expired", variant: "secondary", note: "This alert was never confirmed and its link has expired. Set it up again to receive it." }
      : { label: "Not active: awaiting confirmation", variant: "warning", note: "Open the confirmation link we emailed you to start this alert." };
  }

  if (alert.status === "active") {
    return { label: "Active", variant: "success", note: null };
  }

  return { label: "Not active", variant: "secondary", note: null };
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
  const status = formatStatus(alert);

  return (
    <div className="history-tile">
        <Stack direction="horizontal" className="justify-content-between align-items-start gap-3 flex-wrap mb-3">
          <div>
            <div className="fw-semibold mb-1">{alert.gaugeName}</div>
            <div className="history-muted small">
              {alert.description || (alert.threshold !== null ? `${formatSource(alert.source)} • ${formatDirection(alert.direction)} ${Number(alert.threshold).toFixed(2)} m` : "Status alert")}
            </div>
          </div>
          <Badge bg={status.variant}>{status.label}</Badge>
        </Stack>

        {status.note ? <div className="small mb-2">{status.note}</div> : null}

        <div className="small history-muted mb-3">
          Created: {formatDate(alert.createdAt)}<br />
          Last alert email: {alert.lastTriggeredAt ? formatDate(alert.lastTriggeredAt) : "none yet"}
        </div>

        <div className="d-grid d-sm-flex justify-content-sm-end">
          <Button
            variant="outline-danger"
            onClick={() => onRemove(alert.alertKey)}
            disabled={busyAlertKey === alert.alertKey}
          >
            {busyAlertKey === alert.alertKey ? "Stopping…" : "Stop this alert"}
          </Button>
        </div>
    </div>
  );
}

AlertRow.propTypes = {
  alert: PropTypes.shape({
    alertKey: PropTypes.string.isRequired,
    gaugeName: PropTypes.string.isRequired,
    source: PropTypes.string,
    direction: PropTypes.string,
    threshold: PropTypes.number,
    description: PropTypes.string,
    status: PropTypes.string.isRequired,
    createdAt: PropTypes.string,
    updatedAt: PropTypes.string,
    lastTriggeredAt: PropTypes.string,
    confirmationExpired: PropTypes.bool,
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
    return <StatusMessage state="loading">Loading your alerts…</StatusMessage>;
  }

  if (error) {
    // 404 is an unusable link; anything else is a temporary failure. Neither reveals whose alerts these are.
    return (
      <StatusMessage state={error.status === 404 ? "unavailable" : "error"}>
        {error.status === 404
          ? "This management link has expired or has already been used. Request a new link below."
          : "We could not load your alerts just now. Please try again, or request a new link below."}
      </StatusMessage>
    );
  }

  if (data?.alerts?.length === 0) {
    return <StatusMessage state="empty">There are no active or pending alerts for this email address.</StatusMessage>;
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
    status: PropTypes.number,
  }),
  isPending: PropTypes.bool.isRequired,
  busyAlertKey: PropTypes.string.isRequired,
  onRemove: PropTypes.func.isRequired,
};
