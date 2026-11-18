import "server-only";
import { createHash } from "node:crypto";
import { HttpError } from "../api/http";
import { CSO_HISTORY_WINDOWS, newestFirst } from "./csoHistory.js";

// Server-side continuation for the "Recent upstream spills" list (Wave A cso-history-browsing).
//
// RDP's per-outfall events route is ordered oldest first with a forward-only cursor, and the set read is capped per outfall,
// so there is no producer cursor for a merged, newest-first list. Each page is therefore served from the same bounded,
// cached per-window reads as the first page: the cursor pins that window and the position of the last event served, and
// a continuation recomputes the served prefix exactly as RDP does for its own cursors. If any event already passed over
// changed start, appeared or disappeared, the continuation is refused (409) rather than risk a duplicate or a silent gap.
// The cursor carries no credentials and only public event IDs and times.

export const CSO_HISTORY_PAGE_SIZE = 50;
// A continuation older than this restarts from the newest events instead of re-reading an old window.
export const CSO_HISTORY_CURSOR_MAX_AGE_MS = 6 * 3600000;
const CURSOR_MAX_LENGTH = 1024;
const CURSOR_VERSION = 1;
const EVENT_ID = /^cse_[0-9a-f]{24}$/;
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;

export const CURSOR_STALE_MESSAGE = "The recorded events changed while browsing; start again from the newest events";
export const CURSOR_EXPIRED_MESSAGE = "This list has expired; start again from the newest events";

const isTime = (value) => typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value));
const key = (event) => ({ startedAt: event.startedAt, eventId: event.eventId });

function digest(events) {
  return createHash("sha256").update(events.map((event) => `${event.eventId}@${event.startedAt}`).join("\n")).digest("hex").slice(0, 32);
}

function encode(state) {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

const invalid = () => new HttpError(400, "Invalid history cursor");

// Decodes and checks a continuation against the current query. A cursor for another window, outfall or membership basis is
// refused; one whose pinned window is too old is expired (410) so the visitor restarts at the newest events. A pinned window
// that will be re-read from RDP must be bucket-aligned and exactly the window length, so a cursor can never widen a read.
export function readHistoryCursor(cursor, { windowKey, outfall = null, basis, now = new Date() }) {
  if (typeof cursor !== "string" || !cursor.length || cursor.length > CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid();
  let state;
  try {
    state = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  const spec = CSO_HISTORY_WINDOWS[state?.w];
  if (!state || typeof state !== "object" || state.v !== CURSOR_VERSION || !spec || !isTime(state.f) || !isTime(state.t) ||
      !isTime(state.s) || !EVENT_ID.test(state.e ?? "") || !isTime(state.ts) || !EVENT_ID.test(state.te ?? "") ||
      !Number.isInteger(state.n) || state.n < 1 || typeof state.h !== "string" || !/^[0-9a-f]{32}$/.test(state.h) ||
      !(state.o === null || (typeof state.o === "string" && state.o.length <= 200)) || (state.b !== "legacy" && state.b !== "rdp")) throw invalid();
  if (state.w !== windowKey || state.o !== (outfall ?? null)) throw new HttpError(400, "History cursor does not match this query");
  const from = Date.parse(state.f);
  const to = Date.parse(state.t);
  const bucket = spec.bucketMinutes * MINUTE_MS;
  // Legacy reads and the RDP-membership 30-day reads re-read the pinned window, so it must be exact and aligned. The RDP set
  // read has its own moving window (its pages may be answered a little apart), which is only compared, never requested.
  const rereads = state.b === "legacy" || windowKey === "30d";
  const span = to - from - spec.hours * HOUR_MS;
  if ((rereads ? span !== 0 || to % bucket !== 0 : span < 0 || span > 30 * MINUTE_MS) || to > now.getTime() + bucket + MINUTE_MS) throw invalid();
  if (state.b !== basis || to < now.getTime() - CSO_HISTORY_CURSOR_MAX_AGE_MS) throw new HttpError(410, CURSOR_EXPIRED_MESSAGE);
  return {
    window: { key: windowKey, hours: spec.hours, from: state.f, to: state.t },
    pinnedWindow: rereads ? { key: windowKey, hours: spec.hours, from: state.f, to: state.t } : null,
    position: { startedAt: state.s, eventId: state.e },
    top: { startedAt: state.ts, eventId: state.te },
    served: state.n,
    digest: state.h,
  };
}

// Whether the listed total may be short: some events of the shown outfalls were not read.
function totalIsLowerBound(history, outfall) {
  if (outfall) {
    const entry = history.outfalls.find((row) => row.id === outfall);
    return entry?.state !== "read" || Boolean(entry.truncated);
  }
  const counts = history.evidence?.outfalls ?? {};
  return Boolean(history.evidence?.truncated) || (counts.failed ?? 0) > 0 || (counts.notRead ?? 0) > 0;
}

// One page of the history, newest first, after the optional `outfall` filter. `continuation` comes from readHistoryCursor.
export function paginateHistoryEvents(history, { outfall, continuation = null, basis, pageSize = CSO_HISTORY_PAGE_SIZE } = {}) {
  if (!Array.isArray(history.events)) return history;
  if (outfall !== undefined && outfall !== null && !history.outfalls.some((entry) => entry.id === outfall)) {
    throw new HttpError(400, "outfall must be an upstream member in this view");
  }
  // Defensive: one event ID is listed once, in one deterministic order (start, newest first; then event ID).
  const seen = new Set();
  const matching = (outfall ? history.events.filter((event) => event.outfallId === outfall) : history.events)
    .filter((event) => (seen.has(event.eventId) ? false : seen.add(event.eventId)))
    .sort(newestFirst);

  let start = 0;
  let offset = 0;
  let top = matching[0] ? key(matching[0]) : null;
  let prefix = [];
  let windowMoved = false;
  if (continuation && history.state === "available") {
    ({ top } = continuation);
    prefix = matching.filter((event) => newestFirst(event, top) >= 0 && newestFirst(event, continuation.position) <= 0);
    if (prefix.length !== continuation.served || digest(prefix) !== continuation.digest) throw new HttpError(409, CURSOR_STALE_MESSAGE);
    start = matching.findIndex((event) => newestFirst(event, continuation.position) > 0);
    if (start < 0) start = matching.length;
    offset = continuation.served;
    windowMoved = history.window?.from !== continuation.window.from;
  }

  const events = matching.slice(start, start + pageSize);
  const hasOlder = start + events.length < matching.length;
  const last = events.at(-1);
  const nextCursor = hasOlder && top ? encode({
    v: CURSOR_VERSION, w: history.window.key, b: basis, o: outfall ?? null, f: history.window.from, t: history.window.to,
    s: last.startedAt, e: last.eventId, ts: top.startedAt, te: top.eventId, n: offset + events.length, h: digest([...prefix, ...events]),
  }) : null;
  // Events recorded above where this traversal started: the visitor sees them by going back to the newest page.
  const newerSinceStart = continuation ? Math.max(0, start - continuation.served) : 0;
  return {
    ...history,
    events,
    outfallFilter: outfall ?? null,
    page: {
      size: pageSize,
      offset,
      returned: events.length,
      total: matching.length - newerSinceStart,
      totalIsLowerBound: totalIsLowerBound(history, outfall),
      hasNewer: offset > 0,
      hasOlder,
      nextCursor,
      newerSinceStart,
      windowMoved,
    },
  };
}
