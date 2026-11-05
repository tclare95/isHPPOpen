// Client-safe wording for observed high-water events (#105). Every sentence states what the
// readings show; nothing names an exact crossing instant the readings do not support.
import { BOUNDARY, LIMITATION } from "./events.js";
import { COLWICK_HISTORY } from "./config.js";
import { formatDateTime, formatDuration } from "./present.js";

const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;

export const LIMITATION_TEXT = Object.freeze({
  [LIMITATION.START_UNOBSERVED]: "Start not observed",
  [LIMITATION.END_UNOBSERVED]: "End not observed",
  [LIMITATION.ONGOING]: "No end yet",
  [LIMITATION.GAPS_WITHIN]: "Readings missing during event",
  [LIMITATION.PROVISIONAL]: "Includes provisional readings",
});

const GAP_REASON_TEXT = {
  no_readings: "no readings were returned",
  excluded: "readings were excluded for quality",
  read_failed: "the archive could not be read",
};
export const gapReasonText = (reason) => GAP_REASON_TEXT[reason] ?? "no usable readings";

function gapPhrase(gap) {
  if (!gap) return "no readings";
  return `${formatDuration(Date.parse(gap.to) - Date.parse(gap.from))} without readings`;
}

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, day: "numeric", month: "short", year: "numeric" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { timeZone: COLWICK_HISTORY.timeZone, day: "numeric", month: "short" });

// "19 Dec 2023 – 10 Jan 2024", "3–9 Feb 2024" style labels from the observed span.
export function eventDateRange(event) {
  const a = Date.parse(event.firstAboveAt);
  const b = Date.parse(event.lastAboveAt);
  const first = DATE.format(a);
  const last = DATE.format(b);
  if (first === last) return first;
  if (first.slice(-4) === last.slice(-4)) return `${DAY_MONTH.format(a)} – ${last}`;
  return `${first} – ${last}`;
}

// Supported time at or above, with "at least" when readings are missing during the
// event or a boundary is not observed (the true duration may be longer).
export function eventDurationText(event) {
  const lowerBound = event.limitations.some((item) => item !== LIMITATION.PROVISIONAL);
  return `${lowerBound ? "at least " : ""}${formatDuration(event.aboveMs)}`;
}

export function describeStart(start) {
  const first = formatDateTime(start.edgeAt);
  if (start.status === BOUNDARY.OBSERVED) {
    return { tone: "observed", title: "Rose above " + threshold, text: start.belowAt ? `Between ${formatDateTime(start.belowAt)} and ${first}.` : first };
  }
  if (start.status === BOUNDARY.WITHIN_GAP) {
    return { tone: "gap", title: "Rose during a gap", text: `Between ${formatDateTime(start.belowAt)} and ${first} (${gapPhrase(start.gap)}).` };
  }
  return { tone: "unknown", title: "Start not observed",
    text: start.beyond ? `Already at or above at ${first}; previous reading ${formatDateTime(start.beyond.at)}.` : `Already at or above at ${first}; no earlier readings.` };
}

export function describeEnd(end) {
  const last = formatDateTime(end.edgeAt);
  if (end.status === BOUNDARY.OBSERVED) {
    return { tone: "observed", title: "Fell below " + threshold, text: end.belowAt ? `Between ${last} and ${formatDateTime(end.belowAt)}.` : last };
  }
  if (end.ongoing) return { tone: "unknown", title: "No end yet", text: `Latest reading ${last}.` };
  if (end.status === BOUNDARY.WITHIN_GAP) {
    return { tone: "gap", title: "Fell during a gap", text: `Between ${last} and ${formatDateTime(end.belowAt)} (${gapPhrase(end.gap)}).` };
  }
  return { tone: "unknown", title: "End not observed",
    text: end.beyond ? `Last at or above at ${last}; next reading ${formatDateTime(end.beyond.at)}.` : `Last at or above at ${last}; no later readings.` };
}

// Short qualifier when the highest reading may not be the true peak; empty otherwise.
export function describePeak(event) {
  return event.peak.complete ? "" : "May not be the true peak.";
}

// Plain-language one-liner for lists and the timeline tooltip.
export function eventSummaryLine(event) {
  return `Peak ${event.peak.value.toFixed(2)} m · ${eventDurationText(event)} at or above ${threshold}`;
}
