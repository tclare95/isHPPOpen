"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import StatusMessage from "../layout/site/StatusMessage";
import Stack from "react-bootstrap/Stack";
import { alertDescriptionOf } from "../../libs/alerts/alertDescriptions";

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

  if (alert.status === "paused") {
    return { label: "Paused", variant: "secondary", note: "No emails until you resume it." };
  }

  if (alert.status === "active") {
    return { label: "Active", variant: "success", note: null };
  }

  return { label: "Not active", variant: "secondary", note: null };
}

// Cautions only: a problem-free recent check is never presented as a promise that an email will arrive.
export const ALERT_EVIDENCE_NOTES = Object.freeze({
  delayed: "Recent data for this alert was late or unavailable, so an email may be delayed or missed.",
  unknown: "We cannot confirm recent checks for this alert, so an email may be delayed or missed.",
});
export const ALERT_RESTARTING_NOTE = "Restarting from the next fresh reading. Nothing from before the change will send an email.";

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

const canChange = (alert) => alert.status === "active" || alert.status === "paused";
const alertTypeOf = (alert) => alert.alertType || "gauge";

function initialDraft(alert) {
  if (alertTypeOf(alert) === "hpp_status") return { desiredStatus: alert.desiredStatus || "open" };
  if (alertTypeOf(alert) === "water_quality") return { riskLevel: alert.riskLevel || "amber" };
  return { direction: alert.direction || "above", threshold: alert.threshold === null || alert.threshold === undefined ? "" : Number(alert.threshold).toFixed(2) };
}

/** The changes to submit: only the fields this alert type supports. */
function changesOf(alert, draft) {
  if (alertTypeOf(alert) === "gauge") return { direction: draft.direction, threshold: draft.threshold === "" ? Number.NaN : Number(draft.threshold) };
  return draft;
}

function AlertEditForm({ alert, busy, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => initialDraft(alert));
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const type = alertTypeOf(alert);
  const changes = changesOf(alert, draft);
  const preview = type !== "gauge" || Number.isFinite(changes.threshold) ? alertDescriptionOf({ ...alert, ...changes }) : null;
  const id = (name) => `alert-edit-${name}-${alert.alertKey}`;

  function submit(event) {
    event.preventDefault();
    onSave(changes);
  }

  return (
    <Form onSubmit={submit} className="mb-3" aria-label={`Change ${alert.gaugeName}`}>
      <Stack gap={2}>
        {type === "gauge" ? (
          <div className="d-flex flex-column flex-sm-row gap-2">
            <Form.Group controlId={id("direction")} className="flex-grow-1">
              <Form.Label className="small mb-1">Trigger</Form.Label>
              <Form.Select value={draft.direction} onChange={(event) => set("direction", event.target.value)}>
                <option value="above">Rises to or above</option>
                <option value="below">Drops to or below</option>
              </Form.Select>
            </Form.Group>
            <Form.Group controlId={id("threshold")} className="flex-grow-1">
              <Form.Label className="small mb-1">Threshold ({alert.unit || "m"})</Form.Label>
              <Form.Control type="number" inputMode="decimal" min="0" step="0.01" required value={draft.threshold} onChange={(event) => set("threshold", event.target.value)} />
            </Form.Group>
          </div>
        ) : null}
        {type === "hpp_status" ? (
          <Form.Group controlId={id("status")}>
            <Form.Label className="small mb-1">Notify me when HPP</Form.Label>
            <Form.Select value={draft.desiredStatus} onChange={(event) => set("desiredStatus", event.target.value)}>
              <option value="open">opens</option>
              <option value="closed">closes</option>
            </Form.Select>
          </Form.Group>
        ) : null}
        {type === "water_quality" ? (
          <Form.Group controlId={id("risk")}>
            <Form.Label className="small mb-1">Notify me when CSO risk reaches</Form.Label>
            <Form.Select value={draft.riskLevel} onChange={(event) => set("riskLevel", event.target.value)}>
              <option value="amber">Amber or red</option>
              <option value="red">Red</option>
            </Form.Select>
          </Form.Group>
        ) : null}
        {preview ? <div className="small text-light" aria-live="polite">{preview}</div> : null}
        <div className="small history-muted">Saving restarts the alert from the next fresh reading. The change alone will not send an email.</div>
        <div className="d-grid gap-2 d-sm-flex justify-content-sm-end">
          <Button variant="outline-light" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </Stack>
    </Form>
  );
}

AlertEditForm.propTypes = {
  alert: PropTypes.object.isRequired,
  busy: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

const BUSY_LABELS = { pause: "Pausing…", resume: "Resuming…" };

function AlertRow({ alert, busyAlertKey, busyAction, onRemove, onChange }) {
  const status = formatStatus(alert);
  const [editing, setEditing] = useState(false);
  const busy = busyAlertKey === alert.alertKey;
  const anyBusy = busyAlertKey !== "";
  const toggle = alert.status === "paused" ? "resume" : "pause";

  async function save(changes) {
    if (await onChange(alert.alertKey, { action: "edit", changes })) setEditing(false);
  }

  return (
    <div className="history-tile" data-status={alert.status}>
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
        {alert.restarting ? <div className="small mb-2">{ALERT_RESTARTING_NOTE}</div> : null}
        {ALERT_EVIDENCE_NOTES[alert.evidence] ? <div className="history-notice history-notice--warning small mb-2">{ALERT_EVIDENCE_NOTES[alert.evidence]}</div> : null}

        <div className="small history-muted mb-3">
          Created: {formatDate(alert.createdAt)}<br />
          {alert.status === "paused" ? <>Paused: {formatDate(alert.pausedAt)}<br /></> : null}
          Last alert email: {alert.lastTriggeredAt ? formatDate(alert.lastTriggeredAt) : "none yet"}
        </div>

        {editing ? <AlertEditForm alert={alert} busy={busy} onSave={save} onCancel={() => setEditing(false)} /> : null}

        {!editing ? (
          <div className="d-grid gap-2 d-sm-flex justify-content-sm-end">
            {canChange(alert) && onChange ? (
              <>
                <Button variant="outline-light" onClick={() => setEditing(true)} disabled={anyBusy}>Change</Button>
                <Button variant="outline-light" onClick={() => onChange(alert.alertKey, { action: toggle })} disabled={anyBusy}>
                  {busy && busyAction === toggle ? BUSY_LABELS[toggle] : toggle === "resume" ? "Resume" : "Pause"}
                </Button>
              </>
            ) : null}
            <Button variant="outline-danger" onClick={() => onRemove(alert.alertKey)} disabled={anyBusy}>
              {busy && busyAction === "remove" ? "Stopping…" : "Stop this alert"}
            </Button>
          </div>
        ) : null}
    </div>
  );
}

AlertRow.propTypes = {
  alert: PropTypes.shape({
    alertKey: PropTypes.string.isRequired,
    alertType: PropTypes.string,
    gaugeName: PropTypes.string.isRequired,
    source: PropTypes.string,
    direction: PropTypes.string,
    threshold: PropTypes.number,
    unit: PropTypes.string,
    desiredStatus: PropTypes.string,
    riskLevel: PropTypes.string,
    description: PropTypes.string,
    status: PropTypes.string.isRequired,
    createdAt: PropTypes.string,
    updatedAt: PropTypes.string,
    pausedAt: PropTypes.string,
    lastTriggeredAt: PropTypes.string,
    confirmationExpired: PropTypes.bool,
    restarting: PropTypes.bool,
    evidence: PropTypes.oneOf(["current", "delayed", "unknown"]),
  }).isRequired,
  busyAlertKey: PropTypes.string.isRequired,
  busyAction: PropTypes.string,
  onRemove: PropTypes.func.isRequired,
  onChange: PropTypes.func,
};

export function AlertsManagementFeedback({ successMessage, errorMessage }) {
  return (
    <div aria-live="polite">
      {successMessage ? <Alert variant="success" role="status">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="danger" role="alert">{errorMessage}</Alert> : null}
    </div>
  );
}

AlertsManagementFeedback.propTypes = {
  successMessage: PropTypes.string.isRequired,
  errorMessage: PropTypes.string.isRequired,
};

export function AlertsManagementContent({ data, error, isPending, busyAlertKey, busyAction = "", onRemove, onChange }) {
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
    return <StatusMessage state="empty">There are no active, paused or pending alerts for this email address.</StatusMessage>;
  }

  if (!data?.alerts?.length) {
    return null;
  }

  return (
    <Stack gap={3}>
      {data.alerts.map((alert) => (
        <AlertRow key={alert.alertKey} alert={alert} busyAlertKey={busyAlertKey} busyAction={busyAction} onRemove={onRemove} onChange={onChange} />
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
  busyAction: PropTypes.string,
  onRemove: PropTypes.func.isRequired,
  onChange: PropTypes.func,
};
