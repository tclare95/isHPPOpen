// Compact threshold-state timeline of one period of Colwick observations (#105).
//
// A timeline is the same "nearest supported reading" attribution the #104 digest uses,
// kept as ordered segments instead of totals:
// - each eligible reading supports the time up to halfway to a neighbour at most
//   `maxGapMs` away; consecutive readings on the same side of the threshold form one
//   `above` or `below` segment;
// - everything else inside [from, end) is an `unknown` segment (no readings, excluded
//   readings, or time before the first / after the latest reading). Unknown is never
//   treated as below or above.
// A reading with no supported neighbour still forms a zero-length segment: it is evidence
// of the level at that instant, but supports no duration.
//
// Timelines of consecutive months abut exactly at month boundaries (reads are padded by
// `maxGapMs`), so stitching them reproduces the attribution of one continuous read.

export const SEGMENT = Object.freeze({ ABOVE: "above", BELOW: "below", UNKNOWN: "unknown" });

export const UNKNOWN_REASON = Object.freeze({
  NO_READINGS: "no_readings", // nothing returned, or readings more than maxGapMs apart
  EXCLUDED: "excluded", // readings returned but excluded by quality (suspect, missing…)
  READ_FAILED: "read_failed", // the month could not be read from the archive
});

function emptyStats() {
  return { n: 0, firstAt: null, lastAt: null, peak: null, provisional: 0, edited: 0, revised: 0 };
}

function addReading(stats, point) {
  stats.n++;
  stats.firstAt ??= point.t;
  stats.lastAt = point.t;
  if (!stats.peak || point.v > stats.peak.value) stats.peak = { value: point.v, at: point.t, provisional: point.provisional };
  if (point.provisional) stats.provisional++;
  if (point.edited) stats.edited++;
  if (point.revised) stats.revised++;
}

/**
 * @param {Array<{t:number,v:number,above:boolean,provisional?:boolean,edited?:boolean,revised?:boolean,inPeriod:boolean}>} points
 *   chronological eligible readings, including padding outside the period
 * @param {{from:number,end:number,maxGapMs:number,excludedTimes?:number[]}} period
 * @returns {Array<object>} segments covering [from, end) without overlap
 */
export function buildStateTimeline(points, { from, end, maxGapMs, excludedTimes = [] }) {
  const segments = [];
  if (end <= from) return segments;

  const pushUnknown = (a, b) => {
    if (b <= a) return;
    const excluded = excludedTimes.filter((t) => t >= a && t < b).length;
    segments.push({ state: SEGMENT.UNKNOWN, from: a, to: b, reason: excluded ? UNKNOWN_REASON.EXCLUDED : UNKNOWN_REASON.NO_READINGS, excluded });
  };

  let cursor = from;
  let current = null;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const previous = points[i - 1];
    const next = points[i + 1];
    const left = previous && point.t - previous.t <= maxGapMs ? point.t - (point.t - previous.t) / 2 : point.t;
    const right = next && next.t - point.t <= maxGapMs ? point.t + (next.t - point.t) / 2 : point.t;
    const a = Math.max(left, from);
    const b = Math.min(right, end);
    const inside = point.inPeriod ? a <= b : a < b;
    if (!inside) continue;

    const state = point.above ? SEGMENT.ABOVE : SEGMENT.BELOW;
    if (current && current.state === state && current.to === a) {
      current.to = b;
    } else {
      if (current) segments.push(current);
      pushUnknown(cursor, a);
      current = { state, from: a, to: b, ...emptyStats() };
    }
    if (point.inPeriod) addReading(current, point);
    cursor = b;
  }
  if (current) segments.push(current);
  pushUnknown(cursor, end);
  return segments;
}

function mergeStats(target, source) {
  target.n += source.n;
  target.firstAt ??= source.firstAt;
  target.lastAt = source.lastAt ?? target.lastAt;
  if (source.peak && (!target.peak || source.peak.value > target.peak.value)) target.peak = source.peak;
  target.provisional += source.provisional;
  target.edited += source.edited;
  target.revised += source.revised;
}

/**
 * Joins consecutive month timelines into one series. A month that could not be read is a
 * single unknown segment with reason `read_failed`, never an empty or below period.
 * @param {Array<{from:number,end:number,segments?:Array,failed?:boolean}>} months chronological
 */
export function stitchTimelines(months) {
  const result = [];
  for (const month of months) {
    const segments = month.failed || !month.segments
      ? [{ state: SEGMENT.UNKNOWN, from: month.from, to: month.end, reason: UNKNOWN_REASON.READ_FAILED, excluded: 0 }]
      : month.segments;
    for (const segment of segments) {
      const last = result.at(-1);
      const joinable = last && last.state === segment.state && last.to === segment.from &&
        (segment.state !== SEGMENT.UNKNOWN || last.reason === segment.reason);
      if (joinable) {
        last.to = segment.to;
        if (segment.state === SEGMENT.UNKNOWN) last.excluded += segment.excluded ?? 0;
        else mergeStats(last, segment);
      } else {
        result.push(segment.state === SEGMENT.UNKNOWN ? { ...segment, excluded: segment.excluded ?? 0 } : { ...segment, peak: segment.peak && { ...segment.peak } });
      }
    }
  }
  return result;
}
