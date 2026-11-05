import { buildPeriodDigest } from "../libs/history/digest";
import {
  BOUNDARY, eventId, eventsInPeriod, findEvent, identifyEvents, LIMITATION, parseEventId,
} from "../libs/history/events";
import { stitchTimelines, UNKNOWN_REASON } from "../libs/history/timeline";
import { monthBounds } from "../libs/history/ukCalendar";

const MIN = 60000;
const HOUR = 60 * MIN;
const GOOD = JSON.stringify({ quality: "Good" });
const EDITED = JSON.stringify({ qcode: "Edited", quality: "Good" });
const SUSPECT = JSON.stringify({ quality: "Suspect" });
const ASOF = Date.parse("2026-11-05T12:00:00Z");

// A 15-minute series over [from, to): level(t) returns a value, or null for no reading.
function series(from, to, level, { quality = () => GOOD, revision = () => 1 } = {}) {
  const rows = [];
  for (let t = from; t < to; t += 15 * MIN) {
    const value = level(t);
    if (value !== null && value !== undefined) rows.push({ observedAt: new Date(t).toISOString(), value, quality: quality(t), revision: revision(t) });
  }
  return rows;
}

// Reads like the service: one padded window per UK month, then stitched.
function eventsFrom(rows, months, { asOf = ASOF, failed = [] } = {}) {
  const timelines = months.map(([year, month]) => {
    const { from, to } = monthBounds(year, month);
    if (failed.some(([y, m]) => y === year && m === month)) return { from, end: Math.min(to, asOf), failed: true };
    const window = rows.filter((row) => {
      const t = Date.parse(row.observedAt);
      return t >= from - 30 * MIN && t < Math.min(to + 30 * MIN, asOf);
    });
    const digest = buildPeriodDigest(window, { from, to, asOf });
    return { from, end: Date.parse(digest.period.end), segments: digest.timeline };
  });
  const segments = stitchTimelines(timelines);
  return { events: identifyEvents(segments, { dataEnd: timelines.at(-1).end }), segments };
}

const JUNE = [[2025, 6]];
const juneStart = monthBounds(2025, 6).from;
const at = (days, hours = 0) => juneStart + days * 24 * HOUR + hours * HOUR;
const between = (t, a, b) => t >= a && t < b;

describe("well-supported event", () => {
  const rise = at(10);
  const fall = at(12);
  const rows = series(juneStart, monthBounds(2025, 6).to, (t) => (between(t, rise, fall) ? (t === at(11) ? 3.25 : 2.6) : 1.2));
  const { events } = eventsFrom(rows, JUNE);

  test("is found with observed boundaries, peak and supported duration", () => {
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.id).toBe(eventId(rise));
    expect(event).toMatchObject({ firstAboveAt: rise, lastAboveAt: fall - 15 * MIN, complete: true, limitations: [] });
    expect(event.start).toMatchObject({ status: BOUNDARY.OBSERVED, belowAt: rise - 15 * MIN, edgeAt: rise });
    expect(event.end).toMatchObject({ status: BOUNDARY.OBSERVED, belowAt: fall, edgeAt: fall - 15 * MIN });
    expect(event.peak).toMatchObject({ value: 3.25, at: at(11), complete: true });
    // Same nearest-reading split as #104: half of each crossing interval counts.
    expect(event.aboveMs).toBe(fall - rise);
    expect(event.riseMs).toBe(24 * HOUR);
  });

  test("agrees with the #104 month total of time at or above", () => {
    const { from, to } = monthBounds(2025, 6);
    expect(buildPeriodDigest(rows, { from, to, asOf: ASOF }).summary.aboveMs).toBe(events[0].aboveMs);
  });
});

test("a reading exactly at 2.2 m meets the threshold", () => {
  const rows = series(juneStart, at(3), (t) => (t === at(1) ? 2.2 : t === at(1) + 15 * MIN ? 2.199 : 1.5));
  const { events } = eventsFrom(rows, JUNE);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ firstAboveAt: at(1), lastAboveAt: at(1), aboveMs: 15 * MIN, brief: true });
});

test("an event across a month and year boundary is one event, identical to a continuous read", () => {
  const months = [[2023, 12], [2024, 1]];
  const start = Date.parse("2023-12-30T06:00:00Z");
  const end = Date.parse("2024-01-03T18:00:00Z");
  const rows = series(monthBounds(2023, 12).from, monthBounds(2024, 1).to, (t) => (between(t, start, end) ? 3 + (t === Date.parse("2024-01-01T00:00:00Z") ? 0.5 : 0) : 1.5));
  const { events } = eventsFrom(rows, months);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ firstAboveAt: start, lastAboveAt: end - 15 * MIN, aboveMs: end - start, complete: true, gaps: [], dips: [] });
  expect(events[0].peak.value).toBe(3.5);

  const inJanuary = eventsInPeriod(events, monthBounds(2024, 1).from, monthBounds(2024, 1).to);
  expect(inJanuary[0]).toMatchObject({ beforePeriod: true, afterPeriod: false });
  const inDecember = eventsInPeriod(events, monthBounds(2023, 12).from, monthBounds(2023, 12).to);
  expect(inDecember[0]).toMatchObject({ beforePeriod: false, afterPeriod: true });
  expect(eventsInPeriod(events, monthBounds(2024, 2).from, monthBounds(2024, 2).to)).toEqual([]);
});

describe("missing readings", () => {
  test("a gap before the first high reading bounds the start without inventing a crossing", () => {
    const rows = series(juneStart, at(5), (t) => (between(t, at(1), at(1, 3)) ? null : t >= at(1, 3) && t < at(2) ? 2.8 : 1.4));
    const [event] = eventsFrom(rows, JUNE).events;
    expect(event.start).toMatchObject({ status: BOUNDARY.WITHIN_GAP, belowAt: at(1) - 15 * MIN, edgeAt: at(1, 3) });
    expect(event.start.gap).toMatchObject({ from: at(1) - 15 * MIN, to: at(1, 3), reason: UNKNOWN_REASON.NO_READINGS });
    expect(event.limitations).toContain(LIMITATION.START_UNOBSERVED);
    expect(event.complete).toBe(false);
    // The unknown interval is not counted as high: support starts at the first high reading
    // (no half-interval into the gap) and ends halfway to the first reading below.
    expect(event.aboveMs).toBe(at(2) - 15 * MIN - at(1, 3) + 7.5 * MIN);
  });

  test("a long gap before the first high reading leaves the start unknown", () => {
    const rows = series(juneStart, at(8), (t) => (between(t, at(1), at(4)) ? null : t >= at(4) && t < at(5) ? 2.8 : 1.4));
    const [event] = eventsFrom(rows, JUNE).events;
    expect(event.start).toMatchObject({ status: BOUNDARY.UNKNOWN, belowAt: null, beyond: { state: "below", at: at(1) - 15 * MIN } });
  });

  test("a short gap inside an event is disclosed, not counted as high, and qualifies the peak", () => {
    const rows = series(juneStart, at(6), (t) => (between(t, at(2), at(2, 3)) ? null : between(t, at(1), at(4)) ? 3 : 1.4));
    const { events } = eventsFrom(rows, JUNE);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.gaps).toEqual([{ from: at(2) - 15 * MIN, to: at(2, 3), ms: 3 * HOUR + 15 * MIN, reason: UNKNOWN_REASON.NO_READINGS }]);
    expect(event.unknownWithinMs).toBe(3 * HOUR + 15 * MIN);
    expect(event.aboveMs).toBe(at(4) - at(1) - (3 * HOUR + 15 * MIN));
    expect(event.limitations).toEqual([LIMITATION.GAPS_WITHIN]);
    expect(event.peak.complete).toBe(false);
  });

  test("a gap of a day or more splits episodes, each with an unobserved edge", () => {
    const rows = series(juneStart, at(10), (t) => (between(t, at(2), at(3, 6)) ? null : between(t, at(1), at(5)) ? 3 : 1.4));
    const { events } = eventsFrom(rows, JUNE);
    expect(events).toHaveLength(2);
    expect(events[0].end).toMatchObject({ status: BOUNDARY.UNKNOWN, beyond: { state: "above", at: at(3, 6) }, ongoing: false });
    expect(events[1].start).toMatchObject({ status: BOUNDARY.UNKNOWN, beyond: { state: "above", at: at(2) - 15 * MIN } });
  });

  test("excluded readings are a gap with that reason, never a level", () => {
    const suspect = (t) => between(t, at(2), at(2, 2));
    const rows = series(juneStart, at(6), (t) => (between(t, at(1), at(4)) ? (suspect(t) ? 9.9 : 3) : 1.4),
      { quality: (t) => (suspect(t) ? SUSPECT : GOOD) });
    const [event] = eventsFrom(rows, JUNE).events;
    expect(event.peak.value).toBe(3);
    expect(event.gaps).toHaveLength(1);
    expect(event.gaps[0].reason).toBe(UNKNOWN_REASON.EXCLUDED);
    expect(event.readings.excluded).toBe(8);
  });

  test("one excluded reading between readings 30 minutes apart leaves time supported (#104 rule)", () => {
    const rows = series(juneStart, at(6), (t) => (between(t, at(1), at(4)) ? 3 : 1.4), { quality: (t) => (t === at(2) ? SUSPECT : GOOD) });
    expect(eventsFrom(rows, JUNE).events[0]).toMatchObject({ gaps: [], complete: true });
  });

  test("an isolated high reading is evidence of an instant, supporting no duration", () => {
    const rows = series(juneStart, at(3), (t) => (t === at(1) ? 2.5 : between(t, at(1) - HOUR + 1, at(1) + HOUR) ? null : 1.4));
    const [event] = eventsFrom(rows, JUNE).events;
    expect(event).toMatchObject({ firstAboveAt: at(1), lastAboveAt: at(1), aboveMs: 0 });
    expect(event.start.status).toBe(BOUNDARY.WITHIN_GAP);
    expect(event.end.status).toBe(BOUNDARY.WITHIN_GAP);
  });
});

describe("grouping", () => {
  test("a dip below 2.2 m shorter than a day is listed within one event", () => {
    const rows = series(juneStart, at(8), (t) => (between(t, at(2), at(2, 10)) ? 2.0 : between(t, at(1), at(4)) ? 2.6 : 1.4));
    const { events } = eventsFrom(rows, JUNE);
    expect(events).toHaveLength(1);
    expect(events[0].dips).toEqual([{ from: at(2) - 7.5 * MIN, to: at(2, 10) - 7.5 * MIN, ms: 10 * HOUR }]);
    expect(events[0].belowWithinMs).toBe(10 * HOUR);
    expect(events[0].complete).toBe(true);
  });

  test("high readings a day or more apart are separate events", () => {
    const rows = series(juneStart, at(10), (t) => (between(t, at(1), at(2)) || between(t, at(3), at(4)) ? 2.6 : 1.4));
    expect(eventsFrom(rows, JUNE).events).toHaveLength(2);
  });
});

describe("event ends", () => {
  test("readings still high at the latest reading are an ongoing event with no proven end", () => {
    const asOf = at(5);
    const rows = series(juneStart, asOf, (t) => (t >= at(3) ? 2.9 : 1.4));
    const [event] = eventsFrom(rows, JUNE, { asOf }).events;
    expect(event.end).toMatchObject({ status: BOUNDARY.UNKNOWN, ongoing: true });
    expect(event.limitations).toContain(LIMITATION.ONGOING);
    expect(event.limitations).not.toContain(LIMITATION.END_UNOBSERVED);
  });

  test("a month that could not be read is not mistaken for an ongoing event or for low water", () => {
    const months = [[2025, 6], [2025, 7], [2025, 8]];
    const rows = series(juneStart, monthBounds(2025, 9).from, (t) => (t >= monthBounds(2025, 6).to - 2 * 24 * HOUR && t < monthBounds(2025, 8).from + 24 * HOUR ? 2.9 : 1.4));
    const { events, segments } = eventsFrom(rows, months, { failed: [[2025, 7]] });
    expect(segments.some((s) => s.reason === UNKNOWN_REASON.READ_FAILED)).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0].end).toMatchObject({ status: BOUNDARY.UNKNOWN, ongoing: false, gap: { reason: UNKNOWN_REASON.READ_FAILED } });
    expect(events[1].start).toMatchObject({ status: BOUNDARY.UNKNOWN, gap: { reason: UNKNOWN_REASON.READ_FAILED } });
  });
});

describe("quality and revisions", () => {
  test("provisional, edited and revised readings are counted and disclosed", () => {
    const rows = series(juneStart, at(4), (t) => (between(t, at(1), at(2)) ? 2.7 : 1.4), {
      quality: (t) => (t === at(1, 1) ? null : t === at(1, 2) ? EDITED : GOOD),
      revision: (t) => (t === at(1, 3) ? 2 : 1),
    });
    const [event] = eventsFrom(rows, JUNE).events;
    expect(event.readings).toMatchObject({ provisional: 1, edited: 1, revised: 1, atOrAbove: 96 });
    expect(event.limitations).toEqual([LIMITATION.PROVISIONAL]);
  });

  test("a corrected history recalculates the peak; a link to a revised start resolves to the containing event", () => {
    const level = (peak) => (t) => (between(t, at(1), at(3)) ? (t === at(2) ? peak : 2.6) : 1.4);
    const before = eventsFrom(series(juneStart, at(5), level(3.4)), JUNE).events[0];
    const after = eventsFrom(series(juneStart, at(5), level(3.1)), JUNE).events[0];
    expect(before.id).toBe(after.id);
    expect([before.peak.value, after.peak.value]).toEqual([3.4, 3.1]);

    // First high reading later excluded by the provider: the old link now points inside the event.
    const revised = eventsFrom(series(juneStart, at(5), level(3.1), { quality: (t) => (t === at(1) ? SUSPECT : GOOD) }), JUNE).events;
    expect(revised[0].id).not.toBe(before.id);
    expect(findEvent(revised, before.id)).toMatchObject({ match: "not_found" });
    expect(findEvent(revised, eventId(at(2)))).toMatchObject({ match: "moved", index: 0 });
    expect(findEvent(revised, revised[0].id)).toMatchObject({ match: "exact" });
  });
});

describe("event ids", () => {
  test("round-trip as UTC minutes and reject anything else", () => {
    const ms = Date.parse("2024-01-02T03:15:00Z");
    expect(eventId(ms)).toBe("20240102T0315Z");
    expect(parseEventId("20240102T0315Z")).toBe(ms);
    for (const bad of ["", "2024-01-02", "20241302T0315Z", "20240230T0000Z", "20240102T0315", "x20240102T0315Z", null]) {
      expect(parseEventId(bad)).toBeNull();
    }
    expect(findEvent([], "nonsense")).toEqual({ event: null, match: "invalid" });
  });
});
