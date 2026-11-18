// Shared, client-safe vocabulary for the admin operational overview (Wave B, admin-operational-oversight).
//
// Every component reports one of four states. Missing evidence, a never-run job or a failed evidence read is
// `unknown`, never `healthy`. There is deliberately no combined all-clear: each component keeps its own state.

import { getDisplayedHealthState } from "./operationalHealth";

export const OVERVIEW_STATES = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
});

// Most severe first. `unknown` ranks above `healthy` so missing evidence never reads as fine.
const SEVERITY = { unavailable: 3, degraded: 2, unknown: 1, healthy: 0 };

export const severityOf = (state) => SEVERITY[state] ?? SEVERITY.unknown;

/** The most severe of several states; no states at all is `unknown`. */
export function worstState(states) {
  const known = states.filter(Boolean);
  if (!known.length) return OVERVIEW_STATES.UNKNOWN;
  return known.reduce((worst, state) => (severityOf(state) > severityOf(worst) ? state : worst));
}

const DOCS = "https://github.com/tclare95/isHPPOpen/blob/main/docs";

export const OVERVIEW_LINKS = Object.freeze({
  hppShadowReport: { label: "HPP shadow and writer report (JSON)", href: "/api/admin/hpp-shadow" },
  hppEvidenceDocs: { label: "HPP status service: reading the evidence", href: `${DOCS}/HPP-STATUS-SERVICE.md#reading-and-exporting-the-evidence` },
  hppRollbackDocs: { label: "HPP status service: rollback", href: `${DOCS}/HPP-STATUS-SERVICE.md#rollback` },
  hppWriterDocs: { label: "HPP single-writer control", href: `${DOCS}/HPP-STATUS-SERVICE.md#single-writer-control-active-since-17-november-2026` },
  alertRunDocs: { label: "Alert run records", href: `${DOCS}/ALERT_EVALUATION_RELIABILITY.md#run-records-alertruns` },
  alertReconcileDocs: { label: "Reconciling a held alert delivery", href: `${DOCS}/ALERT_EVALUATION_RELIABILITY.md#operator-reconciliation-of-a-held-delivery` },
  alertIndexDocs: { label: "Alert delivery index provisioning", href: `${DOCS}/ALERT_EVALUATION_RELIABILITY.md#index-provisioning` },
  gaugeAlertDocs: { label: "Live gauge alerts: operator queries", href: `${DOCS}/RDP-GAUGE-ALERTS-51D.md#operator-queries-and-reconciliation-read-only-unless-approved` },
  levelsDocs: { label: "Observed levels sources", href: `${DOCS}/RDP-LEVELS-51C.md` },
  forecastDocs: { label: "ML forecast (#90)", href: `${DOCS}/FORECAST-ML-PRIMARY-90.md` },
  forecastPage: { label: "Forecast page", href: "/forecastinfo" },
  csoShadowReport: { label: "RDP CSO comparison report (JSON)", href: "/api/admin/cso-shadow" },
  csoDocs: { label: "RDP CSO source modes", href: `${DOCS}/RDP-CSO-120.md#modes` },
  wqAssessmentDocs: { label: "Water-quality assessment modes", href: `${DOCS}/RDP-WATER-QUALITY-ASSESSMENT.md#source-switch-rdp_wq_assessment` },
  trentDocs: { label: "Trent weirs sources", href: `${DOCS}/RDP-TRENT-51B.md` },
});

/** Labels and next steps for the existing /api/admin/operational-health source checks. */
export const SOURCE_CHECKS = Object.freeze({
  levels: { label: "Observed river levels", links: [OVERVIEW_LINKS.levelsDocs] },
  forecast: { label: "Predictor forecast", links: [OVERVIEW_LINKS.forecastDocs, OVERVIEW_LINKS.forecastPage] },
  hppStatus: { label: "HPP status record read", links: [OVERVIEW_LINKS.hppEvidenceDocs] },
  waterQuality: { label: "Water-quality assessment in use", links: [OVERVIEW_LINKS.wqAssessmentDocs] },
  trentWeirs: { label: "Trent weirs", links: [OVERVIEW_LINKS.trentDocs] },
});

const SOURCE_STATE_REASONS = {
  stale: "Latest data is older than its freshness limit.",
  fallback: "Serving fallback data instead of the primary source.",
  unavailable: "The check could not read this source.",
};

/**
 * One /api/admin/operational-health source entry in the overview's four states. Its raw `health.state`
 * (fresh | fallback | stale | unavailable) is kept as `sourceState` so the established meaning stays visible.
 */
export function classifySourceCheck(source, now = Date.now()) {
  const meta = SOURCE_CHECKS[source?.name] ?? { label: source?.name ?? "Unknown source", links: [] };
  const sourceState = getDisplayedHealthState(source?.health, now);
  const state = sourceState === "fresh" ? OVERVIEW_STATES.HEALTHY
    : sourceState === "fallback" || sourceState === "stale" ? OVERVIEW_STATES.DEGRADED
      : sourceState === "unavailable" ? OVERVIEW_STATES.UNAVAILABLE
        : OVERVIEW_STATES.UNKNOWN;
  const message = SOURCE_STATE_REASONS[sourceState] ?? (sourceState ? null : "No result was returned for this check.");
  return {
    key: `source:${source?.name ?? "unknown"}`,
    label: meta.label,
    state,
    attention: state !== OVERVIEW_STATES.HEALTHY,
    sourceState: sourceState ?? null,
    summary: sourceState ? `Source check: ${sourceState}` : "Not checked",
    evidenceAt: source?.health?.generatedAt ?? null,
    reasons: state === OVERVIEW_STATES.HEALTHY || !message ? [] : [{ category: sourceState ?? "no_result", state, message }],
    latencyMs: Number.isFinite(source?.latencyMs) ? source.latencyMs : null,
    links: meta.links,
  };
}

/**
 * The "needs attention" list: every component that is not healthy and expects evidence, most severe first.
 * Components that are intentionally not enabled (`attention: false`) are listed separately by the UI.
 */
export function buildNeedsAttention(components) {
  return components
    .filter((component) => component && component.attention && component.state !== OVERVIEW_STATES.HEALTHY)
    .sort((a, b) => severityOf(b.state) - severityOf(a.state));
}
