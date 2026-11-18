// User-facing alert rule wording, shared by the signup form, management view and emails so a subscriber
// sees the same description everywhere. Pure: no I/O, safe to import from client components.
import { TRENT_DASHBOARD_STATIONS, getTrentStationKey } from "../trentWeirsConfig";

export const alertTypeOf = (rule) => rule.alertType || "gauge";
export const alertStationFor = (gaugeKey) => TRENT_DASHBOARD_STATIONS.find((station) => getTrentStationKey(station) === gaugeKey);

export function alertNameOf(rule) {
  if (alertTypeOf(rule) === "hpp_status") return `HPP ${rule.desiredStatus === "open" ? "opens" : "closes"}`;
  if (alertTypeOf(rule) === "water_quality") return `CSO risk reaches ${rule.riskLevel}`;
  return rule.gaugeName || alertStationFor(rule.gaugeKey)?.gaugeName || "Trent gauge";
}

export function alertUnitOf(rule) {
  if (alertTypeOf(rule) !== "gauge") return null;
  return (rule.measureType ?? alertStationFor(rule.gaugeKey)?.measureType) === "flow" ? "cumecs" : "m";
}

/** What triggers the rule, in user terms. */
export function alertDescriptionOf(rule) {
  if (alertTypeOf(rule) === "hpp_status") return `We will email you when HPP is reported ${rule.desiredStatus}.`;
  if (alertTypeOf(rule) === "water_quality") return `We will email you when CSO risk reaches ${rule.riskLevel === "red" ? "red" : "amber or red"}.`;
  const value = `${Number(rule.threshold).toFixed(2)} ${alertUnitOf(rule)}`;
  if (rule.source === "forecast") return `We will email you when the ${alertNameOf(rule)} forecast predicts ${value} or ${rule.direction === "below" ? "lower" : "higher"}.`;
  return `We will email you when the ${alertNameOf(rule)} reading ${rule.direction === "below" ? "drops to or below" : "rises to or above"} ${value}.`;
}

/** How a rule repeats, per alert type. Matches the evaluator's re-arm rules. */
export function alertRepeatOf(rule) {
  if (alertTypeOf(rule) === "hpp_status") return `You get one email, then another only after HPP has been reported ${rule.desiredStatus === "open" ? "closed" : "open"} and becomes ${rule.desiredStatus} again.`;
  if (alertTypeOf(rule) === "water_quality") return "You get one email, then another only after the risk has dropped below that level and reached it again.";
  const margin = alertUnitOf(rule) === "cumecs" ? "1 cumec" : "3 cm";
  if (rule.source === "forecast") return `You get one email, then another only after a later forecast stays at least ${margin} back from the threshold for its whole period and then crosses it again.`;
  return `You get one email, then another only after the reading has moved at least ${margin} back past the threshold and crossed it again.`;
}

/** Shown wherever alerts are offered or confirmed. */
export const ALERT_EXPECTATIONS = Object.freeze([
  "Late, stale or unavailable source data can delay or prevent an alert.",
  "Alerts are for information only. They are not a guarantee of river access or water safety.",
]);
