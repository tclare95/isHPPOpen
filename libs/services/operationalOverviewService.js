// Admin operational overview (Wave B, admin-operational-oversight).
//
// Read-only and bounded. It reads only the operational records the scheduled jobs already keep and never
// triggers a job, replays an alert, calls a provider or scans history:
// - HPP: `hppWriterControl/openIndicator`, the `hpp-colwick` state document in `hppShadowState` and
//   `hppStatusState` (default `_id` index), and the newest valid `openIndicator` record (the public reader's query).
// - Alerts: the newest RECENT_RUN_LIMIT `alertRuns` records by `_id` (default index; inserts are time-ordered),
//   projected to a whitelist of counters and categories. Delivery counts are the collection-wide
//   `outstandingDeliveries` each run already records, so `alertDeliveries` and `alertSubscriptions` are not read.
// - Water quality: the newest `waterQuality` summary (indexed by `scrape_timestamp`) via the existing reader.
// Live upstream checks stay in /api/admin/operational-health; this route adds the jobs' own last-known state.
// Each read fails independently: a failed read makes only its components `unknown`.

import { connectToDatabase } from "../database";
import { getGaugeAlertSourceMode } from "../alerts/gaugeAlertDecision";
import { HPP_STATE_ID, MAX_RUN_AGE_MS, SERVICE_PROVENANCE } from "../hpp/hppHistory.js";
import { AUTHORITATIVE_STATE_COLLECTION } from "../hpp/hppAuthoritativeStore.js";
import { LEGACY_COLLECTION, SHADOW_COLLECTIONS } from "../hpp/hppShadowStore.js";
import { OWNERS, WRITER_CONTROL_COLLECTION, WRITER_CONTROL_ID, ownerOf } from "../hpp/hppWriterControl.js";
import { OVERVIEW_LINKS, OVERVIEW_STATES, worstState } from "../operationalOverview";
import { ALERT_RUN_STALE_MS, ALERT_RUNS_COLLECTION } from "./colwickAlertsService";
import { getHppStatusSource } from "./hppShadowCronService";
import { getLevelsSourceMode } from "./levelsService";
import { getWaterQualityAssessmentMode } from "./waterQualityAssessmentService";
import { getCsoMembershipMode, getCsoSourceMode, getLatestWaterQualitySummaryHealth } from "./waterQualityService";

const { HEALTHY, DEGRADED, UNAVAILABLE, UNKNOWN } = OVERVIEW_STATES;
const MINUTE_MS = 60 * 1000;

/** About five hours of 15-minute alert runs; enough to find the last success and recent failures. */
export const RECENT_RUN_LIMIT = 20;
/** Both jobs run every 15 minutes; three missed runs make their evidence too old to trust. */
export const ALERT_RUN_MAX_AGE_MS = 45 * MINUTE_MS;
export const HPP_RUN_MAX_AGE_MS = MAX_RUN_AGE_MS;

// Only these run-record fields leave the database. Run records hold no addresses or tokens, but a whitelist
// keeps any future field out of the admin payload until it is reviewed.
const RUN_PROJECTION = Object.fromEntries([
  "status", "startedAt", "completedAt", "durationMs", "scanned", "sent", "failed", "uncertain", "heldForReview",
  "errors", "gaugeHeld", "deferred", "sourceFailures", "errorCategory", "errorCategories", "deliveryIndex",
  "outstandingDeliveries", "needsReview", "gaugeSource", "gaugeSources", "waterQualitySource", "waterQuality",
].map((field) => [field, 1]));

// HPP hold reasons that need a human rather than more time (see docs/HPP-STATUS-SERVICE.md, `gaps_explained`).
const HPP_REVIEW_REASONS = new Set(["identity_mismatch", "conflict", "rule_mismatch", "orphaned_transition", "sequence_conflict"]);

const time = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const iso = (value) => { const at = time(value); return at === null ? null : new Date(at).toISOString(); };
const count = (value) => (Number.isFinite(value) ? value : 0);

/** Recorded codes and categories only: anything that does not look like an identifier is withheld. */
export function safeCategory(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : "other";
}

const ago = (at, now) => {
  const minutes = Math.round((now.getTime() - at) / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 120) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

const fact = (label, value, kind = "text") => ({ label, value: value ?? null, kind });
const reason = (category, state, message) => ({ category: safeCategory(category), state, message });

/**
 * One component. With reasons, its state is the most severe reason; without reasons it is healthy only when
 * `evidence` is true, so a component never becomes healthy merely because nothing was found.
 */
function component({ key, label, reasons = [], evidence = true, attention = true, summary, evidenceAt = null, facts = [], links = [] }) {
  const state = reasons.length ? worstState(reasons.map((item) => item.state)) : evidence ? HEALTHY : UNKNOWN;
  return { key, label, state, attention: attention && state !== HEALTHY, summary, evidenceAt: iso(evidenceAt), reasons, facts: facts.filter((item) => item.value !== null), links };
}

const readFailed = (key, label, links) => component({
  key, label, links,
  reasons: [reason("evidence_read_failed", UNKNOWN, "The operational record could not be read, so this is not checked.")],
  summary: "Not checked: evidence read failed",
});

// ---------------------------------------------------------------------------------------------------------------
// HPP status evaluation
// ---------------------------------------------------------------------------------------------------------------

const HPP = { key: "hppEvaluation", label: "HPP status evaluation" };
const HPP_LINKS = [OVERVIEW_LINKS.hppShadowReport, OVERVIEW_LINKS.hppEvidenceDocs, OVERVIEW_LINKS.hppWriterDocs];

function describeLatestRecord(record) {
  if (!record) return [];
  return [
    fact("Public status record", record.value === true ? "open" : record.value === false ? "closed" : null),
    fact("Public status recorded at", iso(record.timestamp), "time"),
    fact("Public status written by", record.provenance === SERVICE_PROVENANCE ? "app (HPP status service)" : "legacy scraper"),
  ];
}

export function buildHppComponent({ env, control, shadowState, authoritativeState, latestRecord }, now) {
  if ([control, shadowState, authoritativeState].some((read) => read.status === "rejected")) return readFailed(HPP.key, HPP.label, HPP_LINKS);
  const record = latestRecord.status === "fulfilled" ? latestRecord.value : null;
  const recordFacts = describeLatestRecord(record);
  let mode;
  try { mode = getHppStatusSource(env); } catch { mode = null; }
  const owner = ownerOf(control.value);
  const base = { ...HPP, links: HPP_LINKS };
  const modeFacts = [fact("Mode (HPP_STATUS_SOURCE)", mode ?? "invalid"), fact("Writer control owner", owner)];

  if (mode === null) {
    return component({ ...base, summary: "Configuration invalid: the HPP evaluation route fails",
      reasons: [reason("invalid_config", DEGRADED, "HPP_STATUS_SOURCE is not legacy, shadow or authoritative; scheduled runs return an error.")],
      facts: [...modeFacts, ...recordFacts] });
  }
  if (mode === "legacy") {
    const reasons = owner === OWNERS.APP
      ? [reason("writer_mismatch", DEGRADED, "The writer control names the app but in-app evaluation is off, so nothing writes the public status.")] : [];
    return component({ ...base, reasons, evidence: false, attention: reasons.length > 0,
      summary: reasons.length ? "Nothing is writing the public HPP status" : "Not checked: in-app evaluation is off (legacy scraper writes the status)",
      evidenceAt: record?.timestamp, facts: [...modeFacts, ...recordFacts] });
  }

  const authoritative = mode === "authoritative" && owner === OWNERS.APP;
  const state = authoritative ? authoritativeState.value : shadowState.value;
  const health = state?.health ?? {};
  const reasons = [];
  if (owner === OWNERS.APP && !authoritative) {
    reasons.push(reason("writer_mismatch", DEGRADED, "The writer control names the app but the mode is not authoritative, so nothing writes the public status."));
  }
  const lastRunAt = time(health.lastRunAt);
  const facts = [
    ...modeFacts,
    fact("Evaluation", authoritative ? "authoritative (writes the public status)" : "shadow (evidence only)"),
    fact("Last run", iso(health.lastRunAt), "time"),
    fact("Last action", health.lastAction ? `${safeCategory(health.lastAction)}${health.lastReason ? ` (${safeCategory(health.lastReason)})` : ""}` : null),
    fact("Last observation used", iso(health.lastObservedAt), "time"),
    fact("Evaluated status", state && typeof state.open === "boolean" ? (state.open ? "open" : "closed") : null),
    fact("Evaluated status since", iso(state?.changedAt), "time"),
    ...recordFacts,
  ];

  if (lastRunAt === null) {
    reasons.push(reason("never_run", UNKNOWN, authoritative
      ? "No authoritative evaluation has been recorded; the handover may not have seeded state yet."
      : "No shadow evaluation run has been recorded yet."));
    return component({ ...base, reasons, summary: "Not checked: no evaluation run recorded", evidenceAt: record?.timestamp, facts });
  }
  if (now.getTime() - lastRunAt > HPP_RUN_MAX_AGE_MS) {
    reasons.push(reason("stale_run", DEGRADED, `Last evaluation ran ${ago(lastRunAt, now)}; runs are scheduled every 15 minutes.`));
  }
  if (health.holdSince) {
    const holdReason = safeCategory(health.holdReason ?? "unspecified");
    const review = HPP_REVIEW_REASONS.has(holdReason);
    reasons.push(reason(`hold:${holdReason}`, DEGRADED,
      `Holding since ${iso(health.holdSince)} (${count(health.consecutiveHolds)} consecutive runs): ${holdReason}${review ? "; needs review, it will not clear with time" : ""}.`));
  }
  if (health.lastSourceError) {
    reasons.push(reason(`source_error:${safeCategory(health.lastSourceError)}`, DEGRADED, `The last run could not read Colwick evidence (${safeCategory(health.lastSourceError)}).`));
  }
  const summary = reasons.length ? reasons[0].message : `Evaluated ${ago(lastRunAt, now)}: ${safeCategory(health.lastAction ?? "unknown")}`;
  return component({ ...base, reasons, summary, evidenceAt: health.lastRunAt, facts });
}

// ---------------------------------------------------------------------------------------------------------------
// Alert evaluation, delivery and the inputs the evaluator recorded
// ---------------------------------------------------------------------------------------------------------------

const ALERT_EVALUATION = { key: "alertEvaluation", label: "Alert evaluation" };
const ALERT_DELIVERY = { key: "alertDelivery", label: "Alert delivery" };
const ALERT_GAUGES = { key: "alertGaugeInputs", label: "Observed levels used by alerts" };
const ALERT_FORECAST = { key: "alertForecastInput", label: "Forecast used by alerts" };
const WATER_QUALITY = { key: "waterQuality", label: "CSO and water quality" };

const SOURCE_FAILURE_MESSAGES = {
  "gauge-source-config": "RDP_GAUGE_ALERTS_SOURCE is invalid, so live gauge rules were not evaluated.",
  forecast: "The predictor forecast was missing or not fresh; forecast rules were skipped.",
  hpp: "The HPP status read failed; HPP status rules were skipped.",
  water: "The Sewage Map summary was missing or not fresh; water-quality rules were held.",
  cso: "The CSO density series could not be read; water-quality rules were held.",
  "wq-assessment-config": "RDP_WQ_ASSESSMENT is invalid, so water-quality rules were skipped.",
  "wq-assessment": "The RDP water-quality assessment was unavailable; water-quality rules were held.",
};
const sourceFailureMessage = (failure) => SOURCE_FAILURE_MESSAGES[failure]
  ?? (failure.startsWith("gauge:") ? `Gauge ${safeCategory(failure.slice(6))} was not fresh at the run.` : "A source was unusable at the run.");

/** Runs newest first, with the reference run for each kind of evidence. */
function selectRuns(runs, now) {
  const latest = runs[0] ?? null;
  const inProgress = latest?.status === "running" && now.getTime() - (time(latest.startedAt) ?? 0) <= ALERT_RUN_STALE_MS;
  const reference = runs.find((run, index) => !(index === 0 && inProgress)) ?? null;
  // Runs that reached the end of evaluation carry counters and per-source evidence.
  const evaluated = runs.find((run) => run.status === "success" || run.status === "degraded") ?? null;
  return { latest, inProgress, reference, evaluated };
}

const runFacts = (run, label = "Latest finished run") => run ? [
  fact(label, iso(run.startedAt), "time"),
  fact("Run outcome", safeCategory(run.status)),
] : [];

function evidenceStale(run, now) {
  const at = time(run?.startedAt);
  return at === null || now.getTime() - at > ALERT_RUN_MAX_AGE_MS;
}

export function buildAlertEvaluationComponent(runsRead, env, now) {
  const base = { ...ALERT_EVALUATION, links: [OVERVIEW_LINKS.alertRunDocs] };
  if (runsRead.status === "rejected") return readFailed(base.key, base.label, base.links);
  const runs = runsRead.value;
  if (!runs.length) {
    return component({ ...base, reasons: [reason("never_run", UNKNOWN, "No alert evaluation run has been recorded.")], summary: "Not checked: no alert run recorded" });
  }
  const { latest, inProgress, reference } = selectRuns(runs, now);
  const failures = runs.filter((run) => ["failed", "incomplete"].includes(run.status));
  const lastFailure = failures[0];
  const lastSuccess = runs.find((run) => run.status === "success");
  const facts = [
    fact("Latest run started", iso(latest.startedAt), "time"),
    ...(inProgress ? [fact("Latest run", "in progress")] : []),
    ...runFacts(reference),
    fact("Active alerts evaluated", reference && Number.isFinite(reference.scanned) ? reference.scanned : null, "count"),
    fact("Run duration", Number.isFinite(reference?.durationMs) ? `${Math.round(reference.durationMs / 1000)} s` : null),
    fact("Gauge source", reference?.gaugeSource ? safeCategory(reference.gaugeSource) : (getGaugeAlertSourceMode(env) ?? "invalid")),
    fact("Water-quality source", reference?.waterQualitySource ? safeCategory(reference.waterQualitySource) : null),
    fact(`Failed or incomplete in last ${runs.length} runs`, failures.length, "count"),
    fact("Last failed or incomplete run", iso(lastFailure?.startedAt), "time"),
    fact(`Last successful run (of last ${runs.length})`, lastSuccess ? iso(lastSuccess.startedAt) : "none", lastSuccess ? "time" : "text"),
  ];
  const reasons = [];

  if (now.getTime() - (time(latest.startedAt) ?? 0) > ALERT_RUN_MAX_AGE_MS) {
    reasons.push(reason("stale_run", DEGRADED, `No alert run has started since ${iso(latest.startedAt)}; runs are scheduled every 15 minutes.`));
  }
  if (!reference) {
    reasons.push(reason("first_run_in_progress", UNKNOWN, "The first recorded run is still in progress."));
  } else if (reference.status === "running") {
    reasons.push(reason("run_interrupted", DEGRADED, "The latest run did not finish (likely timed out); the next run marks it incomplete."));
  } else if (reference.status === "failed") {
    reasons.push(reason(`run_failed:${safeCategory(reference.errorCategory ?? "error")}`, UNAVAILABLE, `The latest run stopped with an error (${safeCategory(reference.errorCategory ?? "error")}); no rules were evaluated after it.`));
  } else if (reference.status === "incomplete") {
    reasons.push(reason("run_incomplete", DEGRADED, "The latest run was interrupted before recording its outcome."));
  } else if (reference.status === "degraded") {
    for (const failure of (reference.sourceFailures ?? []).map(String)) reasons.push(reason(`source:${failure}`, DEGRADED, sourceFailureMessage(failure)));
    if (count(reference.errors)) {
      const categories = Object.keys(reference.errorCategories ?? {}).map(safeCategory).join(", ");
      reasons.push(reason("rule_errors", DEGRADED, `${count(reference.errors)} rule(s) failed with a database error${categories ? ` (${categories})` : ""}; a later run resumes them.`));
    }
    if (count(reference.gaugeHeld)) reasons.push(reason("gauge_held", DEGRADED, `${count(reference.gaugeHeld)} live gauge rule(s) were held because their reading was not alert-safe.`));
  } else if (reference.status !== "success") {
    reasons.push(reason("unrecognised_status", UNKNOWN, "The latest run has an unrecognised outcome."));
  }
  // A run marked degraded only for delivery reasons is reported under Alert delivery, not here.
  const summary = reasons.length ? reasons[0].message : `Last run ${ago(time(reference.startedAt), now)}: ${safeCategory(reference.status)}`;
  return component({ ...base, reasons, summary, evidenceAt: reference?.startedAt ?? latest.startedAt, facts });
}

export function buildAlertDeliveryComponent(runsRead, now) {
  const base = { ...ALERT_DELIVERY, links: [OVERVIEW_LINKS.alertReconcileDocs, OVERVIEW_LINKS.alertIndexDocs] };
  if (runsRead.status === "rejected") return readFailed(base.key, base.label, base.links);
  const runs = runsRead.value;
  const { evaluated } = selectRuns(runs, now);
  if (!evaluated) {
    return component({ ...base, reasons: [reason("not_recorded", UNKNOWN, "No completed alert run has recorded delivery evidence.")], summary: "Not checked: no delivery evidence" });
  }
  const recent = runs.filter((run) => run.status === "success" || run.status === "degraded");
  const sentRecently = recent.reduce((total, run) => total + count(run.sent), 0);
  const failedRecently = recent.reduce((total, run) => total + count(run.failed), 0);
  const lastSent = recent.find((run) => count(run.sent) > 0);
  const outstanding = evaluated.outstandingDeliveries;
  const facts = [
    ...runFacts(evaluated, "Evidence from run"),
    fact(`Alerts sent in last ${recent.length} completed runs`, sentRecently, "count"),
    fact("Last alert sent", iso(lastSent?.completedAt ?? lastSent?.startedAt), "time"),
    fact(`Definite send failures in last ${recent.length} completed runs`, failedRecently, "count"),
    fact("Held for review", outstanding ? count(outstanding.heldForReview) : null, "count"),
    fact("Uncertain, awaiting retry", outstanding ? count(outstanding.uncertain) : null, "count"),
    fact("Stale claims", outstanding ? count(outstanding.staleClaims) : null, "count"),
    fact("Unique delivery index", evaluated.deliveryIndex ? safeCategory(evaluated.deliveryIndex) : null),
  ];
  const reasons = [];
  if (evidenceStale(evaluated, now)) reasons.push(reason("evidence_stale", UNKNOWN, `Delivery evidence is from ${iso(evaluated.startedAt)}; no recent run has recorded it.`));
  if (!outstanding) reasons.push(reason("outstanding_unrecorded", UNKNOWN, "The run could not count outstanding deliveries."));
  if (count(outstanding?.heldForReview)) reasons.push(reason("held_for_review", DEGRADED, `${count(outstanding.heldForReview)} delivery(ies) are held for operator review; automatic retry is no longer safe.`));
  if (count(outstanding?.staleClaims)) reasons.push(reason("stale_claims", DEGRADED, `${count(outstanding.staleClaims)} delivery claim(s) are older than 10 minutes; their outcome is unknown.`));
  if (count(outstanding?.uncertain)) reasons.push(reason("uncertain_sends", DEGRADED, `${count(outstanding.uncertain)} send(s) have an uncertain outcome and will be retried with the same key.`));
  if (evaluated.deliveryIndex === "missing") reasons.push(reason("delivery_index_missing", DEGRADED, "The unique alert delivery index is missing; runs are degraded until it is provisioned."));
  if (failedRecently) reasons.push(reason("recent_send_failures", DEGRADED, `${failedRecently} send(s) were definitely rejected recently; those rules were re-armed.`));
  const summary = reasons.length ? reasons[0].message : `No held, uncertain or failed deliveries at the run ${ago(time(evaluated.startedAt), now)}`;
  return component({ ...base, reasons, summary, evidenceAt: evaluated.startedAt, facts });
}

/** Evidence the alert evaluator recorded about one input, or the reason it cannot be used. */
function evaluatedInput(runsRead, base, now) {
  if (runsRead.status === "rejected") return { done: readFailed(base.key, base.label, base.links) };
  const { evaluated } = selectRuns(runsRead.value, now);
  if (!evaluated) {
    return { done: component({ ...base, reasons: [reason("not_recorded", UNKNOWN, "No completed alert run has recorded this input.")], summary: "Not checked: no alert run evidence" }) };
  }
  if (evidenceStale(evaluated, now)) {
    return { done: component({ ...base, reasons: [reason("evidence_stale", UNKNOWN, `The newest evidence is from ${iso(evaluated.startedAt)}; no recent alert run has recorded it.`)],
      summary: "Not checked recently", evidenceAt: evaluated.startedAt, facts: runFacts(evaluated, "Evidence from run") }) };
  }
  return { run: evaluated };
}

export function buildAlertGaugeInputsComponent(runsRead, env, now) {
  const base = { ...ALERT_GAUGES, links: [OVERVIEW_LINKS.gaugeAlertDocs, OVERVIEW_LINKS.levelsDocs] };
  const { done, run } = evaluatedInput(runsRead, base, now);
  if (done) return done;
  const gauges = Object.entries(run.gaugeSources ?? {});
  const facts = [
    ...runFacts(run, "Evidence from run"),
    fact("Gauge alert source", run.gaugeSource ? safeCategory(run.gaugeSource) : null),
    fact("Displayed levels source (RDP_LEVELS_SOURCE)", getLevelsSourceMode(env) ?? "invalid"),
    ...gauges.map(([key, read]) => fact(`Gauge ${safeCategory(key)}`, `${safeCategory(read?.status ?? "unknown")}${iso(read?.newestObservedAt) ? `, newest ${iso(read.newestObservedAt)}` : ""}`)),
  ];
  const reasons = [];
  if ((run.sourceFailures ?? []).includes("gauge-source-config")) reasons.push(reason("invalid_config", DEGRADED, SOURCE_FAILURE_MESSAGES["gauge-source-config"]));
  for (const [key, read] of gauges) {
    if (read?.status === "fresh") continue;
    const detail = read?.status === "error" ? ` (${safeCategory(read.error)})` : "";
    reasons.push(reason(`gauge:${key}`, DEGRADED, `Gauge ${safeCategory(key)} was ${safeCategory(read?.status ?? "unknown")}${detail} at the run; its live rules were held.`));
  }
  if (!gauges.length && !reasons.length) {
    return component({ ...base, evidence: false, attention: false, summary: "Not checked: no active live gauge alerts, so no gauge was read", evidenceAt: run.startedAt, facts });
  }
  const summary = reasons.length ? reasons[0].message : `${gauges.length} gauge read(s) fresh at the run ${ago(time(run.startedAt), now)}`;
  return component({ ...base, reasons, summary, evidenceAt: run.startedAt, facts });
}

export function buildAlertForecastComponent(runsRead, now) {
  const base = { ...ALERT_FORECAST, links: [OVERVIEW_LINKS.forecastDocs, OVERVIEW_LINKS.forecastPage] };
  const { done, run } = evaluatedInput(runsRead, base, now);
  if (done) return done;
  const reasons = (run.sourceFailures ?? []).includes("forecast") ? [reason("forecast_unusable", DEGRADED, SOURCE_FAILURE_MESSAGES.forecast)] : [];
  return component({ ...base, reasons, evidenceAt: run.startedAt,
    summary: reasons.length ? reasons[0].message : `Forecast was usable at the run ${ago(time(run.startedAt), now)}`,
    facts: [...runFacts(run, "Evidence from run"), fact("Model accuracy", "not recorded by the app; see the forecast page")] });
}

// ---------------------------------------------------------------------------------------------------------------
// CSO and water quality
// ---------------------------------------------------------------------------------------------------------------

export function buildWaterQualityComponent({ summaryRead, runsRead }, env, now) {
  const base = { ...WATER_QUALITY, links: [OVERVIEW_LINKS.csoShadowReport, OVERVIEW_LINKS.csoDocs, OVERVIEW_LINKS.wqAssessmentDocs] };
  const csoMode = getCsoSourceMode(env);
  const assessmentMode = getWaterQualityAssessmentMode(env);
  const membershipMode = getCsoMembershipMode(env);
  // With every consumer on RDP nothing reads the legacy Sewage Map summary, so its age is information only.
  const summaryUnused = csoMode === "rdp" && assessmentMode === "rdp" && membershipMode === "rdp";
  const reasons = [];
  const facts = [
    fact("CSO status source (RDP_CSO_SOURCE)", csoMode ?? "invalid"),
    fact("Assessment (RDP_WQ_ASSESSMENT)", assessmentMode ?? "invalid"),
    fact("Upstream membership (RDP_CSO_MEMBERSHIP)", membershipMode ?? "invalid"),
  ];
  for (const [name, mode] of [["RDP_CSO_SOURCE", csoMode], ["RDP_WQ_ASSESSMENT", assessmentMode], ["RDP_CSO_MEMBERSHIP", membershipMode]]) {
    if (mode === null) reasons.push(reason(`invalid_config:${name}`, DEGRADED, `${name} is not a recognised value; the site falls back to legacy for it.`));
  }

  let evidence = false;
  let evidenceAt = null;
  if (summaryRead.status === "rejected") {
    reasons.push(reason("summary_read_failed", UNKNOWN, "The Sewage Map summary could not be read."));
  } else if (!summaryRead.value) {
    if (!summaryUnused) reasons.push(reason("summary_missing", UNKNOWN, "No Sewage Map summary has been recorded."));
  } else {
    const health = summaryRead.value.health;
    evidence = true;
    evidenceAt = health?.generatedAt;
    facts.push(fact("Sewage Map summary scraped", iso(health?.generatedAt), "time"), fact("Summary freshness", health?.state ? safeCategory(health.state) : null));
    if (health?.state !== "fresh" && !summaryUnused) {
      reasons.push(reason("summary_stale", DEGRADED, `The Sewage Map summary is ${health?.generatedAt ? `from ${iso(health.generatedAt)}` : "undated"}, older than 30 minutes; the indicator and water-quality alerts treat it as stale.`));
    }
  }

  if (runsRead.status === "fulfilled") {
    const { evaluated } = selectRuns(runsRead.value, now);
    if (evaluated && !evidenceStale(evaluated, now)) {
      evidence = true;
      facts.push(fact("Alert run evidence", iso(evaluated.startedAt), "time"));
      const diagnostics = evaluated.waterQuality;
      if (diagnostics) {
        facts.push(fact("RDP assessment level at run", diagnostics.level ? safeCategory(String(diagnostics.level)) : null),
          fact("RDP assessment observed", iso(diagnostics.observedAt), "time"));
      }
      for (const failure of ["water", "cso", "wq-assessment", "wq-assessment-config"]) {
        if (!(evaluated.sourceFailures ?? []).includes(failure)) continue;
        const detail = failure === "wq-assessment" && diagnostics?.reason ? ` Reason: ${safeCategory(diagnostics.reason)}.` : "";
        reasons.push(reason(`alert_input:${failure}`, DEGRADED, `${SOURCE_FAILURE_MESSAGES[failure]}${detail}`));
      }
    }
  }
  const summary = reasons.length ? reasons[0].message
    : evidence ? "Summary fresh and water-quality alert inputs usable at the latest run" : "Not checked: no current evidence";
  return component({ ...base, reasons, evidence, summary, evidenceAt, facts });
}

// ---------------------------------------------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------------------------------------------

const settle = (promiseFactory) => Promise.resolve().then(promiseFactory).then(
  (value) => ({ status: "fulfilled", value }),
  (error) => ({ status: "rejected", reason: error }),
);

/** The bounded reads. Each is independent; a failure is returned as a rejected result, never thrown. */
export async function readOverviewEvidence({ db, now, readWaterQualitySummary = getLatestWaterQualitySummaryHealth }) {
  const stateProjection = { projection: { open: 1, changedAt: 1, health: 1 } };
  const [control, shadowState, authoritativeState, latestRecord, runs, summary] = await Promise.all([
    settle(() => db.collection(WRITER_CONTROL_COLLECTION).findOne({ _id: WRITER_CONTROL_ID }, { projection: { owner: 1 } })),
    settle(() => db.collection(SHADOW_COLLECTIONS.state).findOne({ _id: HPP_STATE_ID }, stateProjection)),
    settle(() => db.collection(AUTHORITATIVE_STATE_COLLECTION).findOne({ _id: HPP_STATE_ID }, stateProjection)),
    settle(() => db.collection(LEGACY_COLLECTION).findOne(
      { timestamp: { $exists: true }, value: { $in: [true, false] } },
      { sort: { timestamp: -1 }, projection: { timestamp: 1, value: 1, provenance: 1 } },
    )),
    settle(() => db.collection(ALERT_RUNS_COLLECTION).find({}, { projection: RUN_PROJECTION }).sort({ _id: -1 }).limit(RECENT_RUN_LIMIT).toArray()),
    settle(() => readWaterQualitySummary(now)),
  ]);
  return { control, shadowState, authoritativeState, latestRecord, runs, summary };
}

/** Pure: last-known state of each operational component from already-read evidence. */
export function buildOperationalOverview(evidence, { env = process.env, now = new Date() } = {}) {
  return [
    buildHppComponent({ env, ...evidence }, now),
    buildAlertEvaluationComponent(evidence.runs, env, now),
    buildAlertDeliveryComponent(evidence.runs, now),
    buildAlertGaugeInputsComponent(evidence.runs, env, now),
    buildAlertForecastComponent(evidence.runs, now),
    buildWaterQualityComponent({ summaryRead: evidence.summary, runsRead: evidence.runs }, env, now),
  ];
}

// Stands in for the database when the connection fails, so every read reports its own failure.
const UNREACHABLE_DB = Object.freeze({ collection() { throw new Error("database unavailable"); } });

/** Never throws for evidence failures: unreadable evidence becomes `unknown` components (a partial result). */
export async function getOperationalOverview({ env = process.env, now = new Date(), db, readWaterQualitySummary } = {}) {
  const database = db ?? await connectToDatabase().then(({ db: connected }) => connected, () => UNREACHABLE_DB);
  const evidence = await readOverviewEvidence({ db: database, now, readWaterQualitySummary });
  return { checkedAt: now.toISOString(), components: buildOperationalOverview(evidence, { env, now }) };
}
