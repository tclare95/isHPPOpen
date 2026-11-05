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
  if (!gap) return "a period without usable readings";
  return `${formatDuration(Date.parse(gap.to) - Date.parse(gap.from))} when ${gapReasonText(gap.reason)}`;
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
    return start.belowAt
      ? { tone: "observed", title: "Rise observed", text: `Below ${threshold} at ${formatDateTime(start.belowAt)}; at or above by ${first}.` }
      : { tone: "observed", title: "Rise observed", text: `First at or above ${threshold} at ${first}.` };
  }
  if (start.status === BOUNDARY.WITHIN_GAP) {
    return { tone: "gap", title: "Rise during a gap",
      text: `Last below ${threshold} at ${formatDateTime(start.belowAt)}, then ${gapPhrase(start.gap)}. First at or above at ${first}; the exact time it rose is not known.` };
  }
  if (!start.beyond) {
    return { tone: "unknown", title: "Start not observed", text: `There are no earlier readings in the archive. The level was already at or above ${threshold} at ${first}.` };
  }
  return { tone: "unknown", title: "Start not observed",
    text: start.beyond.state === "above"
      ? `The level was also at or above ${threshold} at ${formatDateTime(start.beyond.at)}, before ${start.gap ? `a gap when ${gapReasonText(start.gap.reason)}` : "a gap"}. This event may have begun earlier; first reading after the gap: ${first}.`
      : `The nearest earlier reading (${formatDateTime(start.beyond.at)}) is too far away to show when the level rose${start.gap ? `: ${gapReasonText(start.gap.reason)} in between` : ""}. First at or above at ${first}.` };
}

export function describeEnd(end) {
  const last = formatDateTime(end.edgeAt);
  if (end.status === BOUNDARY.OBSERVED) {
    return end.belowAt
      ? { tone: "observed", title: "Return below observed", text: `Last at or above ${threshold} at ${last}; below by ${formatDateTime(end.belowAt)}.` }
      : { tone: "observed", title: "Return below observed", text: `Last at or above ${threshold} at ${last}.` };
  }
  if (end.ongoing) {
    return { tone: "unknown", title: "No end observed yet", text: `The latest reading (${last}) is at or above ${threshold}. The event is shown as it stands; it may continue.` };
  }
  if (end.status === BOUNDARY.WITHIN_GAP) {
    return { tone: "gap", title: "Return during a gap",
      text: `Last at or above ${threshold} at ${last}, then ${gapPhrase(end.gap)}. Next reading below at ${formatDateTime(end.belowAt)}; the exact time it fell is not known.` };
  }
  if (!end.beyond) {
    return { tone: "unknown", title: "End not observed", text: `There are no later readings in the archive after ${last}, when the level was still at or above ${threshold}.` };
  }
  return { tone: "unknown", title: "End not observed",
    text: end.beyond.state === "above"
      ? `After ${last} ${end.gap ? gapReasonText(end.gap.reason) : "readings are missing"} until ${formatDateTime(end.beyond.at)}, when the level was again at or above ${threshold}. The event may have continued through the gap.`
      : `After ${last} the next reading is not until ${formatDateTime(end.beyond.at)}, too late to show when the level fell.` };
}

export function describePeak(event) {
  if (event.peak.complete) return "Highest reading during the event.";
  if (event.gaps.length) return "Highest reading observed. Readings are missing during this event, so the true peak may have been higher.";
  if (event.start.status === BOUNDARY.UNKNOWN) return "Highest reading observed. The event may have begun before the readings available, so a higher earlier level cannot be ruled out.";
  return "Highest reading observed. The event may have continued after the readings available, so a higher later level cannot be ruled out.";
}

// Plain-language one-liner for lists and the timeline tooltip.
export function eventSummaryLine(event) {
  return `Peak ${event.peak.value.toFixed(2)} m · ${eventDurationText(event)} at or above ${threshold}`;
}
