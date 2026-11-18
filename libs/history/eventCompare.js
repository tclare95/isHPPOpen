// Client-safe comparison of two observed high-water events (Wave C / C1). Every figure keeps the
// event's own limitations: an unobserved boundary or missing readings make a duration a lower
// bound and a peak only the highest observed reading, and a difference is only stated as far
// as those bounds support it. Nothing here is a ranking of floods or a travel time.
import { COLWICK_HISTORY } from "./config.js";
import { BOUNDARY, LIMITATION, parseEventId } from "./events.js";
import { eventDateRange, eventDurationText } from "./eventPresent.js";
import { formatDuration, formatLevel } from "./present.js";

const threshold = `${COLWICK_HISTORY.thresholdMetres.toFixed(1)} m`;

export const ALIGN = Object.freeze({ PEAK: "peak", START: "start" });
export const ALIGN_TEXT = Object.freeze({
  [ALIGN.PEAK]: "highest reading",
  [ALIGN.START]: `first reading at or above ${threshold}`,
});

// ?a=&b=&align= with safe fallbacks. Malformed ids are reported, never guessed.
export function readCompareParams(params) {
  const read = (key) => {
    const raw = params.get(key);
    if (!raw) return { id: null, invalid: false };
    return parseEventId(raw) === null ? { id: null, invalid: true } : { id: raw, invalid: false };
  };
  const a = read("a");
  const b = read("b");
  return {
    a: a.id,
    b: b.id,
    invalid: { a: a.invalid, b: b.invalid },
    align: params.get("align") === ALIGN.START ? ALIGN.START : ALIGN.PEAK,
  };
}

export function compareHref(a, b, align = ALIGN.PEAK) {
  const query = new URLSearchParams();
  if (a) query.set("a", a);
  if (b) query.set("b", b);
  if (align !== ALIGN.PEAK) query.set("align", align);
  const text = query.toString();
  return text ? `/history/events/compare?${text}` : "/history/events/compare";
}

// The instant each curve is aligned at.
export function alignAnchor(event, align) {
  return Date.parse(align === ALIGN.START ? event.firstAboveAt : event.peak.at);
}

// The supported time at or above is exact only when nothing but provisional readings limit it.
const durationIsLowerBound = (event) => event.limitations.some((item) => item !== LIMITATION.PROVISIONAL);
const startExact = (event) => event.start.status === BOUNDARY.OBSERVED;
const endExact = (event) => event.end.status === BOUNDARY.OBSERVED;
const atLeast = (lower, ms) => `${lower ? "at least " : ""}${formatDuration(ms)}`;

function sumMs(items) {
  return items.reduce((total, item) => total + item.ms, 0);
}

/** Rows for the side-by-side table: { label, values: [a, b], note? }. */
export function comparisonRows(a, b) {
  const row = (label, value, note) => ({ label, values: [value(a), value(b)], ...(note ? { note } : {}) });
  return [
    row("Dates", (event) => eventDateRange(event)),
    row("Highest reading", (event) => `${formatLevel(event.peak.value)}${event.peak.complete ? "" : " (highest observed)"}${event.peak.provisional ? " · provisional" : ""}`),
    row(`Time at or above ${threshold}`, (event) => eventDurationText(event)),
    row("First to last reading at or above", (event) => atLeast(!startExact(event) || !endExact(event), event.spanMs),
      "Includes any dips below and gaps in between."),
    row("Rise to highest reading", (event) => atLeast(!startExact(event), event.riseMs)),
    row("Highest reading to recovery", (event) => (event.end.ongoing ? "No end yet" : atLeast(!endExact(event), event.fallMs))),
    row("Dips below / missing readings", (event) => {
      const dips = event.dips.length ? `${event.dips.length} dip${event.dips.length === 1 ? "" : "s"} (${formatDuration(sumMs(event.dips))})` : "No dips";
      const gaps = event.gaps.length ? `${formatDuration(sumMs(event.gaps))} missing` : "no gaps";
      return `${dips} · ${gaps}`;
    }),
  ];
}

const label = (index) => (index === 0 ? "the first event" : "the second event");
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Ordering two quantities when either may be only a lower bound: a lower bound that already
// exceeds an exact value supports "by at least"; anything else cannot be ordered.
function orderBounds(values, lowers) {
  const [x, y] = values;
  if (x === y) return lowers[0] || lowers[1] ? { unknown: true, uncertain: lowers[0] ? 0 : 1 } : { equal: true };
  const higher = x > y ? 0 : 1;
  const lower = 1 - higher;
  if (lowers[lower]) return { unknown: true, uncertain: lower };
  return { higher, diff: values[higher] - values[lower], atLeast: lowers[higher] };
}

/** Plain-language differences that the evidence supports, with reasons where it does not. */
export function comparisonDifferences(a, b) {
  const events = [a, b];
  const lines = [];

  const peak = orderBounds(events.map((event) => event.peak.value), events.map((event) => !event.peak.complete));
  if (peak.equal) lines.push("Both reached the same peak.");
  else if (peak.unknown) {
    const diff = Math.abs(a.peak.value - b.peak.value);
    const who = !a.peak.complete && !b.peak.complete ? "either event" : label(peak.uncertain);
    lines.push(`${diff ? `Highest readings differ by ${formatLevel(diff)}` : "Highest readings are equal"}, but the true peak of ${who} may not have been observed, so which peaked higher is not known.`);
  } else {
    lines.push(`${capital(label(peak.higher))} reached ${peak.atLeast ? "at least " : ""}${formatLevel(peak.diff)} higher.`);
  }

  const duration = orderBounds(events.map((event) => event.aboveMs), events.map(durationIsLowerBound));
  if (duration.equal) lines.push(`Both spent the same time at or above ${threshold}.`);
  else if (duration.unknown) {
    lines.push(`Which stayed at or above ${threshold} longer is not known: part of ${durationIsLowerBound(a) && durationIsLowerBound(b) ? "both events" : label(duration.uncertain)} was not observed.`);
  } else {
    lines.push(`${capital(label(duration.higher))} stayed at or above ${threshold} for ${duration.atLeast ? "at least " : ""}${formatDuration(duration.diff)} longer.`);
  }

  if (events.some((event) => event.peak.provisional || event.limitations.includes(LIMITATION.PROVISIONAL))) {
    lines.push("Provisional readings are not yet qualified and may change.");
  }
  return lines;
}
