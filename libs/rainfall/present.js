// Wording for the observed rainfall view. Pure, so every honesty rule is unit-tested in one place.

const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" });

// EA rainfall telemetry normally arrives 30-70 minutes after its label, in batches (RDP RAINFALL.md "Freshness").
// Beyond this, the gauge is described as delayed rather than "usual delay". RDP itself labels anything older than
// two periods `stale`, which is accurate but true almost all the time, so it is not repeated as a warning.
export const RAINFALL_DELAYED_AFTER_MS = 2 * 3600000;

export const UNAVAILABLE_TEXT = {
  not_configured: "Rain gauge data is not connected in this environment.",
  not_published: "These rain gauges are not published by the River Data Platform in this environment.",
  not_authorised: "This site is not currently authorised to read the rain gauge data.",
  invalid_response: "The rain gauge data failed validation, so it is not shown.",
  temporarily_unavailable: "Rain gauge data is temporarily unavailable.",
};

export function formatMm(value) {
  if (!Number.isFinite(value)) return "–";
  return `${value.toFixed(value > 0 && value < 0.1 ? 2 : 1)} mm`;
}

export function formatLabelTime(value, withDay = false) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(ms) ? (withDay ? DAY_TIME : TIME).format(ms) : "–";
}

function formatAge(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h ${minutes % 60} min ago` : `${Math.floor(hours / 24)} days ago`;
}

/** One accumulation window as a headline and detail line. Never a total unless the window is complete. */
export function describeWindow(window) {
  if (!window) return { headline: "–", detail: "Not available", state: "unavailable" };
  if (window.status === "complete") {
    const detail = window.periodStart
      ? `All ${window.expected} intervals, ${formatLabelTime(window.periodStart, true)}–${formatLabelTime(window.periodEnd)}`
      : `All ${window.expected} intervals reported`;
    return { headline: formatMm(window.totalMm), detail, state: "complete" };
  }
  if (window.status === "empty") {
    return { headline: "No reports", detail: `None of ${window.expected} intervals reported`, state: "empty" };
  }
  return {
    headline: `at least ${formatMm(window.reportedMm)}`,
    detail: `${window.missing} of ${window.expected} intervals missing`,
    state: "incomplete",
  };
}

/** The newest reported label and how late it is, measured from the label (never from an assumed period end). */
export function describeLatest(gauge, nowMs = Date.now()) {
  const label = gauge?.latestReportedLabel ?? gauge?.latest?.label ?? null;
  if (!label) return { text: "No recent reports", state: "none" };
  const ageMs = nowMs - Date.parse(label);
  return {
    text: `Label ${formatLabelTime(label, true)} · ${formatAge(ageMs)}`,
    state: ageMs > RAINFALL_DELAYED_AFTER_MS ? "delayed" : "usual",
  };
}

export function describeConvention(convention) {
  if (convention === "period_end") return "label marks the end of the 15 minutes (verified)";
  if (convention === "period_start") return "label marks the start of the 15 minutes (verified)";
  if (convention === "mixed") return "mix of verified and unverified labels";
  return "start or end of the 15 minutes not verified";
}
