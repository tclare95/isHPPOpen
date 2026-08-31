"use client";

import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Stack from "react-bootstrap/Stack";
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../../libs/trentWeirsConfig";

const initial = { email: "", alertType: "gauge", gaugeKey: "4009-level", source: "live", direction: "above", threshold: "1.50", desiredStatus: "open", riskLevel: "amber" };

export default function AlertsSignup() {
  const [form, setForm] = useState(initial); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedStation = TRENT_DASHBOARD_STATIONS.find((station) => getTrentStationKey(station) === form.gaugeKey);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const payload = { email: form.email, alertType: form.alertType };
    if (form.alertType === "gauge") Object.assign(payload, { gaugeKey: form.gaugeKey, source: form.source, direction: form.direction, threshold: Number(form.threshold) });
    if (form.alertType === "hpp_status") payload.desiredStatus = form.desiredStatus;
    if (form.alertType === "water_quality") payload.riskLevel = form.riskLevel;
    try { const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body?.error?.message || "Unable to save this alert."); setMessage(body.data?.message || "Check your email to confirm this alert."); set("email", ""); } catch (submitError) { setError(submitError.message); } finally { setBusy(false); }
  }
  return <Form onSubmit={submit}><Stack gap={3}>{message ? <Alert variant="success" className="mb-0">{message}</Alert> : null}{error ? <Alert variant="danger" className="mb-0">{error}</Alert> : null}
    <Form.Group><Form.Label>Email</Form.Label><Form.Control type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" /></Form.Group>
    <Form.Group><Form.Label>What should we watch?</Form.Label><Form.Select value={form.alertType} onChange={(e) => set("alertType", e.target.value)}><option value="gauge">Trent gauge level or flow</option><option value="hpp_status">HPP opening or closing</option><option value="water_quality">CSO water-quality risk</option></Form.Select></Form.Group>
    {form.alertType === "gauge" ? <><Form.Group><Form.Label>Gauge</Form.Label><Form.Select value={form.gaugeKey} onChange={(e) => set("gaugeKey", e.target.value)}>{TRENT_DASHBOARD_STATIONS.map((station) => <option key={getTrentStationKey(station)} value={getTrentStationKey(station)}>{station.gaugeName} ({station.measureType})</option>)}</Form.Select></Form.Group><Form.Group><Form.Label>Rule</Form.Label><Form.Select value={form.source} onChange={(e) => set("source", e.target.value)}><option value="live">Live reading</option>{form.gaugeKey === "4009-level" ? <option value="forecast">Colwick forecast</option> : null}</Form.Select></Form.Group><Form.Group><Form.Label>Trigger</Form.Label><Form.Select value={form.direction} onChange={(e) => set("direction", e.target.value)}><option value="above">Rises to or above</option><option value="below">Drops to or below</option></Form.Select></Form.Group><Form.Group><Form.Label>Threshold ({selectedStation?.measureType === "flow" ? "cumecs" : "m"})</Form.Label><Form.Control type="number" min="0" step="0.01" required value={form.threshold} onChange={(e) => set("threshold", e.target.value)} /></Form.Group></> : null}
    {form.alertType === "hpp_status" ? <Form.Group><Form.Label>Notify me when HPP</Form.Label><Form.Select value={form.desiredStatus} onChange={(e) => set("desiredStatus", e.target.value)}><option value="open">opens</option><option value="closed">closes</option></Form.Select></Form.Group> : null}
    {form.alertType === "water_quality" ? <Form.Group><Form.Label>Notify me when CSO risk reaches</Form.Label><Form.Select value={form.riskLevel} onChange={(e) => set("riskLevel", e.target.value)}><option value="amber">Amber</option><option value="red">Red</option></Form.Select></Form.Group> : null}
    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save email alert"}</Button></Stack></Form>;
}
