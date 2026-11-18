"use client";

import PropTypes from "prop-types";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../../libs/trentWeirsConfig";
import { ALERT_EXPECTATIONS, alertDescriptionOf, alertRepeatOf } from "../../libs/alerts/alertDescriptions";

const initial = { email: "", alertType: "gauge", gaugeKey: "4009-level", source: "live", direction: "above", threshold: "1.50", desiredStatus: "open", riskLevel: "amber" };
const FORECAST_GAUGE_KEY = "4009-level";
export const ALERT_REQUEST_FAILED_SUFFIX = "No new alert has been activated.";

function ruleOf(form) {
  if (form.alertType === "hpp_status") return { alertType: form.alertType, desiredStatus: form.desiredStatus };
  if (form.alertType === "water_quality") return { alertType: form.alertType, riskLevel: form.riskLevel };
  // Forecasts exist for Colwick only; switching gauge must not submit a stale forecast choice.
  const source = form.gaugeKey === FORECAST_GAUGE_KEY ? form.source : "live";
  return { alertType: form.alertType, gaugeKey: form.gaugeKey, source, direction: form.direction, threshold: form.threshold === "" ? Number.NaN : Number(form.threshold) };
}

/** What the selected rule will do, in the same words the confirmation email and management view use. */
export function AlertRuleSummary({ rule }) {
  const complete = rule.alertType !== "gauge" || Number.isFinite(rule.threshold);
  return (
    <div className="small" aria-live="polite">
      {complete ? <div className="text-light mb-1">{alertDescriptionOf(rule)}</div> : null}
      {complete ? <div className="text-secondary mb-1">{alertRepeatOf(rule)}</div> : null}
      <ul className="text-secondary mb-0 ps-3">
        {ALERT_EXPECTATIONS.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </div>
  );
}

AlertRuleSummary.propTypes = {
  rule: PropTypes.shape({
    alertType: PropTypes.string,
    gaugeKey: PropTypes.string,
    gaugeName: PropTypes.string,
    source: PropTypes.string,
    direction: PropTypes.string,
    threshold: PropTypes.number,
    desiredStatus: PropTypes.string,
    riskLevel: PropTypes.string,
  }).isRequired,
};

export default function AlertsSignup() {
  const [form, setForm] = useState(initial); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedStation = TRENT_DASHBOARD_STATIONS.find((station) => getTrentStationKey(station) === form.gaugeKey);
  const rule = ruleOf(form);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try { const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email, ...rule }) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body?.error?.message || "Unable to save this alert."); setMessage(body.data?.message || "Check your email to confirm this alert. It is not active until you confirm it."); set("email", ""); } catch (submitError) { setError(`${submitError.message || "Unable to save this alert."} ${ALERT_REQUEST_FAILED_SUFFIX}`); } finally { setBusy(false); }
  }
  return <Form onSubmit={submit}><Stack gap={3}>{message ? <Alert variant="info" className="mb-0" role="status">{message}</Alert> : null}{error ? <Alert variant="danger" className="mb-0">{error}</Alert> : null}
    <Form.Group controlId="alert-signup-email"><Form.Label>Email</Form.Label><Form.Control type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" /></Form.Group>
    <Form.Group controlId="alert-signup-type"><Form.Label>What should we watch?</Form.Label><Form.Select value={form.alertType} onChange={(e) => set("alertType", e.target.value)}><option value="gauge">Trent gauge level or flow</option><option value="hpp_status">HPP opening or closing</option><option value="water_quality">CSO water-quality risk</option></Form.Select></Form.Group>
    {form.alertType === "gauge" ? <><Form.Group controlId="alert-signup-gauge"><Form.Label>Gauge</Form.Label><Form.Select value={form.gaugeKey} onChange={(e) => set("gaugeKey", e.target.value)}>{TRENT_DASHBOARD_STATIONS.map((station) => <option key={getTrentStationKey(station)} value={getTrentStationKey(station)}>{station.gaugeName} ({station.measureType})</option>)}</Form.Select></Form.Group><Form.Group controlId="alert-signup-source"><Form.Label>Rule</Form.Label><Form.Select value={rule.source} onChange={(e) => set("source", e.target.value)}><option value="live">Live reading</option>{form.gaugeKey === FORECAST_GAUGE_KEY ? <option value="forecast">Colwick forecast</option> : null}</Form.Select></Form.Group><Form.Group controlId="alert-signup-direction"><Form.Label>Trigger</Form.Label><Form.Select value={form.direction} onChange={(e) => set("direction", e.target.value)}><option value="above">Rises to or above</option><option value="below">Drops to or below</option></Form.Select></Form.Group><Form.Group controlId="alert-signup-threshold"><Form.Label>Threshold ({selectedStation?.measureType === "flow" ? "cumecs" : "m"})</Form.Label><Form.Control type="number" min="0" step="0.01" required value={form.threshold} onChange={(e) => set("threshold", e.target.value)} /></Form.Group></> : null}
    {form.alertType === "hpp_status" ? <Form.Group controlId="alert-signup-status"><Form.Label>Notify me when HPP</Form.Label><Form.Select value={form.desiredStatus} onChange={(e) => set("desiredStatus", e.target.value)}><option value="open">opens</option><option value="closed">closes</option></Form.Select></Form.Group> : null}
    {form.alertType === "water_quality" ? <Form.Group controlId="alert-signup-risk"><Form.Label>Notify me when CSO risk reaches</Form.Label><Form.Select value={form.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}><option value="amber">Amber or red</option><option value="red">Red</option></Form.Select></Form.Group> : null}
    <AlertRuleSummary rule={rule} />
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save email alert"}</Button></Stack></Form>;
}
