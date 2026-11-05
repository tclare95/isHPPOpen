// Observed high-water events at Colwick (#105): pure identification over a stitched
// threshold-state timeline (see timeline.js). Documented in docs/HISTORICAL_RIVER_EVENTS.md.
//
// Rule: an event is a period of eligible readings at or above the 2.2 m reference.
// Readings at or above the reference less than `mergeWindowMs` (24 h) apart belong to the
// same event, whatever lies between them; the dips below the reference and the unknown
// intervals between them are listed with the event, never hidden or counted as high.
//
// Evidence, never interpolation:
// - start/end are "observed" only when the crossing lies between two consecutive readings
//   at most 30 minutes apart; "within_gap" when the nearest earlier/later reading was below
//   but readings are missing in between; otherwise "unknown" (no earlier/later reading, or
//   the level was already/still at or above on the far side of a long gap or failed read).
// - time at or above is supported time only (the #104 nearest-reading split);
// - the peak is the highest eligible reading, flagged when readings are missing inside the
//   event or a boundary is unknown, because the true peak may not have been observed.
// Events are recalculated from the current canonical history on every read, so provider
// revisions can move, merge, split or re-rank them.
import { COLWICK_HISTORY } from "./config.js";
import { SEGMENT, UNKNOWN_REASON } from "./timeline.js";

const HOUR_MS = 60 * 60 * 1000;

export const EVENT_RULES = Object.freeze({
  thresholdMetres: COLWICK_HISTORY.thresholdMetres,
  maxSupportedGapMs: COLWICK_HISTORY.maxSupportedGapMs,
  // Readings at or above the reference closer together than this are one event.
  mergeWindowMs: 24 * HOUR_MS,
  // Events shorter than this (supported time at or above) are labelled brief.
  briefMs: 6 * HOUR_MS,
});

export const BOUNDARY = Object.freeze({ OBSERVED: "observed", WITHIN_GAP: "within_gap", UNKNOWN: "unknown" });

export const LIMITATION = Object.freeze({
  START_UNOBSERVED: "start_unobserved",
  END_UNOBSERVED: "end_unobserved",
  ONGOING: "ongoing",
  GAPS_WITHIN: "gaps_within",
  PROVISIONAL: "provisional",
});

// Stable, URL-safe id: the first observed at/above reading in UTC, e.g. 20240102T0315Z.
export function eventId(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\d{2}\.\d{3}Z$/, "Z");
}

const ID_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})Z$/;
export function parseEventId(id) {
  const match = typeof id === "string" ? ID_PATTERN.exec(id) : null;
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  return eventId(ms) === id ? ms : null;
}

// Nearest reading-bearing segment walking away from `index` in `direction`.
function nearestObserved(segments, index, direction) {
  for (let i = index + direction; i >= 0 && i < segments.length; i += direction) {
    if (segments[i].state !== SEGMENT.UNKNOWN && segments[i].n > 0) return segments[i];
  }
  return null;
}

function boundary(segments, index, direction, { dataEnd, mergeWindowMs }) {
  const neighbour = segments[index + direction];
  const edgeAt = direction < 0 ? segments[index].firstAt : segments[index].lastAt;
  if (neighbour?.state === SEGMENT.BELOW) {
    return {
      status: BOUNDARY.OBSERVED,
      belowAt: direction < 0 ? neighbour.lastAt : neighbour.firstAt,
      edgeAt,
    };
  }
  const gap = neighbour?.state === SEGMENT.UNKNOWN ? neighbour : null;
  const observed = nearestObserved(segments, index, direction);
  const base = { edgeAt, gap: gap && { from: gap.from, to: gap.to, reason: gap.reason } };
  const observedAt = observed && (direction < 0 ? observed.lastAt : observed.firstAt);
  // A below reading bounds the crossing only when it is close enough to be the same
  // rise/recession (< merge window); a below reading days or months away bounds nothing useful.
  if (observed?.state === SEGMENT.BELOW && Math.abs(observedAt - edgeAt) < mergeWindowMs) {
    return { ...base, status: BOUNDARY.WITHIN_GAP, belowAt: observedAt };
  }
  // No nearby reading beyond the gap, or the level was at or above there too: the event
  // may have started earlier / continued later.
  return {
    ...base,
    status: BOUNDARY.UNKNOWN,
    belowAt: null,
    beyond: observed ? { state: observed.state, at: observedAt } : null,
    ongoing: direction > 0 && !observed && (!gap || gap.to >= dataEnd) && gap?.reason !== UNKNOWN_REASON.READ_FAILED,
  };
}

function summarise(segments, startIndex, endIndex, options) {
  const inside = segments.slice(startIndex, endIndex + 1);
  const above = inside.filter((segment) => segment.state === SEGMENT.ABOVE);
  const first = segments[startIndex];
  const last = segments[endIndex];
  const peak = above.reduce((best, segment) => (segment.peak && (!best || segment.peak.value > best.value) ? segment.peak : best), null);
  const sum = (list, pick) => list.reduce((total, segment) => total + pick(segment), 0);
  const dips = inside.filter((segment) => segment.state === SEGMENT.BELOW)
    .map((segment) => ({ from: segment.from, to: segment.to, ms: segment.to - segment.from }));
  const gaps = inside.filter((segment) => segment.state === SEGMENT.UNKNOWN)
    .map((segment) => ({ from: segment.from, to: segment.to, ms: segment.to - segment.from, reason: segment.reason }));
  const start = boundary(segments, startIndex, -1, options);
  const end = boundary(segments, endIndex, 1, options);

  const readingSegments = inside.filter((segment) => segment.state !== SEGMENT.UNKNOWN);
  const readings = {
    total: sum(readingSegments, (s) => s.n),
    atOrAbove: sum(above, (s) => s.n),
    provisional: sum(readingSegments, (s) => s.provisional),
    edited: sum(readingSegments, (s) => s.edited),
    revised: sum(readingSegments, (s) => s.revised),
    excluded: sum(inside, (s) => s.excluded ?? 0),
  };

  const limitations = [];
  if (start.status !== BOUNDARY.OBSERVED) limitations.push(LIMITATION.START_UNOBSERVED);
  if (end.ongoing) limitations.push(LIMITATION.ONGOING);
  else if (end.status !== BOUNDARY.OBSERVED) limitations.push(LIMITATION.END_UNOBSERVED);
  if (gaps.length) limitations.push(LIMITATION.GAPS_WITHIN);
  if (readings.provisional) limitations.push(LIMITATION.PROVISIONAL);

  const aboveMs = sum(above, (s) => s.to - s.from);
  return {
    id: eventId(first.firstAt),
    firstAboveAt: first.firstAt,
    lastAboveAt: last.lastAt,
    spanMs: last.lastAt - first.firstAt,
    aboveMs,
    belowWithinMs: sum(dips, (d) => d.ms),
    unknownWithinMs: sum(gaps, (g) => g.ms),
    peak: { value: peak.value, at: peak.at, provisional: Boolean(peak.provisional),
      // The true peak may be unobserved if readings are missing inside the event or a boundary is unknown.
      complete: !gaps.length && start.status !== BOUNDARY.UNKNOWN && end.status !== BOUNDARY.UNKNOWN },
    riseMs: peak.at - first.firstAt,
    fallMs: last.lastAt - peak.at,
    start, end,
    dips, gaps,
    readings,
    complete: limitations.length === 0,
    brief: aboveMs < EVENT_RULES.briefMs,
    limitations,
  };
}

/**
 * @param {Array} segments stitched timeline (see stitchTimelines), chronological
 * @param {{dataEnd:number, mergeWindowMs?:number}} options dataEnd = end of elapsed history read
 * @returns {Array} events, chronological
 */
export function identifyEvents(segments, { dataEnd, mergeWindowMs = EVENT_RULES.mergeWindowMs }) {
  const events = [];
  let startIndex = null;
  let endIndex = null;
  segments.forEach((segment, index) => {
    if (segment.state !== SEGMENT.ABOVE || segment.n === 0) return;
    if (startIndex !== null && segment.firstAt - segments[endIndex].lastAt < mergeWindowMs) {
      endIndex = index;
      return;
    }
    if (startIndex !== null) events.push(summarise(segments, startIndex, endIndex, { dataEnd, mergeWindowMs }));
    startIndex = index;
    endIndex = index;
  });
  if (startIndex !== null) events.push(summarise(segments, startIndex, endIndex, { dataEnd, mergeWindowMs }));
  return events;
}

// Events overlapping [from, to), with whether they continue across either edge.
// Accepts server (ms) or API (ISO string) instants.
const toMs = (value) => (typeof value === "number" ? value : Date.parse(value));
export function eventsInPeriod(events, from, to) {
  return events.filter((event) => toMs(event.firstAboveAt) < to && toMs(event.lastAboveAt) >= from)
    .map((event) => ({ ...event, beforePeriod: toMs(event.firstAboveAt) < from, afterPeriod: toMs(event.lastAboveAt) >= to }));
}

// Exact id match, else the event whose observed span contains that instant (revisions can
// move an event's first reading), else null.
export function findEvent(events, id) {
  const at = parseEventId(id);
  if (at === null) return { event: null, match: "invalid" };
  const index = events.findIndex((event) => event.id === id);
  if (index > -1) return { event: events[index], index, match: "exact" };
  const containing = events.findIndex((event) => event.firstAboveAt <= at && at <= event.lastAboveAt);
  if (containing > -1) return { event: events[containing], index: containing, match: "moved" };
  return { event: null, match: "not_found" };
}
