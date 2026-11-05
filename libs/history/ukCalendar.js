// UK (Europe/London) calendar periods expressed as UTC instants. Reads and analysis stay
// in UTC; only period boundaries and day labels use the UK presentation calendar, so a
// July month starts at 23:00Z on 30 June and DST days have 23 or 25 hours.
import { COLWICK_HISTORY } from "./config.js";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: COLWICK_HISTORY.timeZone,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function londonParts(ms) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms))
    .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

function londonOffsetMs(ms) {
  const p = londonParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000;
}

// UTC instant of local midnight. Day/month overflow is normalised (e.g. day 32).
// UK DST changes at 01:00Z, so local midnight always exists exactly once.
export function londonMidnightUtc(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - londonOffsetMs(guess);
  return guess - londonOffsetMs(first);
}

export function monthBounds(year, month) {
  return { from: londonMidnightUtc(year, month, 1), to: londonMidnightUtc(year, month + 1, 1) };
}

export function yearBounds(year) {
  return { from: londonMidnightUtc(year, 1, 1), to: londonMidnightUtc(year + 1, 1, 1) };
}

const pad = (value) => String(value).padStart(2, "0");

export function londonDateKey(ms) {
  const p = londonParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// Local days covering [from, to), each { date: "YYYY-MM-DD", from, to } in UTC ms.
export function londonDays(from, to) {
  const days = [];
  const start = londonParts(from);
  for (let offset = 0; ; offset++) {
    const dayFrom = londonMidnightUtc(start.year, start.month, start.day + offset);
    if (dayFrom >= to) break;
    days.push({ date: londonDateKey(dayFrom), from: dayFrom, to: londonMidnightUtc(start.year, start.month, start.day + offset + 1) });
  }
  return days;
}

export function currentLondonMonth(now = Date.now()) {
  const p = londonParts(now);
  return { year: p.year, month: p.month };
}
