import { connectToDatabase } from '../database';
import { ObjectId } from 'mongodb';
import { HttpError } from '../api/http';
import { londonDateKey, londonMidnightUtc } from '../history/ukCalendar';

const COLLECTION = 'eventschemas';

export const ADMIN_EVENT_SCOPES = ['upcoming', 'current', 'past', 'all'];
export const ADMIN_EVENTS_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_EVENTS_MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const MAX_PAGE = 10000;
const MAX_NAME_LENGTH = 200;
const MAX_DETAILS_LENGTH = 10000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Public homepage feed: unchanged semantics (events ending no earlier than ~yesterday, soonest first).
export async function fetchUpcomingEvents(limit = 5) {
  const { db } = await connectToDatabase();
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const collection = db.collection(COLLECTION);
  const data = await collection
    .find({ event_end_date: { $gte: now } })
    .limit(limit)
    .sort({ event_start_date: 1 })
    .toArray();
  return { count: data.length, eventsArray: data };
}

/** Parses a stable event identity; anything other than a 24-hex ObjectId is a 400, never a fallback match. */
export function parseEventId(id) {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw new HttpError(400, 'Invalid event id');
  }
  return new ObjectId(id);
}

/**
 * Events are whole UK calendar days. The editor sends date-only `YYYY-MM-DD` values, stored as that
 * day's UTC midnight (the established format). Only real calendar dates are accepted: `2026-02-30`
 * is rejected instead of rolling over to March.
 */
export function parseEventDate(value) {
  const match = typeof value === 'string' ? DATE_ONLY.exec(value.trim()) : null;
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** The UK calendar day of a stored event date as `YYYY-MM-DD` (also correct for legacy UK-midnight values). */
export function toEventDateKey(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : londonDateKey(parsed.getTime());
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Validates an editor payload `{ name, startDate, endDate, details }`, reporting every problem at once. */
export function validateEventInput(input) {
  if (!isPlainObject(input)) throw new HttpError(400, 'Invalid request body');
  const problems = [];
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';

  if (!name) problems.push('Event name is required.');
  else if (name.length > MAX_NAME_LENGTH) problems.push(`Event name must be ${MAX_NAME_LENGTH} characters or fewer.`);

  const start = parseEventDate(input.startDate);
  const end = parseEventDate(input.endDate);
  if (!input.startDate) problems.push('Start date is required.');
  else if (!start) problems.push('Start date must be a real date in YYYY-MM-DD format.');
  if (!input.endDate) problems.push('End date is required.');
  else if (!end) problems.push('End date must be a real date in YYYY-MM-DD format.');
  if (start && end && end < start) problems.push('End date can’t be before the start date.');

  if (!details) problems.push('Event details are required.');
  else if (details.length > MAX_DETAILS_LENGTH) problems.push(`Event details must be ${MAX_DETAILS_LENGTH} characters or fewer.`);

  if (problems.length > 0) throw new HttpError(400, problems.join(' '));

  return { event_name: name, event_start_date: start, event_end_date: end, event_details: details };
}

function parseBoundedInteger(raw, { name, fallback, min, max }) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

/** Normalises admin list query parameters, rejecting unknown scopes and out-of-range paging. */
export function parseAdminEventsQuery(params = {}) {
  const scope = params.scope ? String(params.scope) : 'upcoming';
  if (!ADMIN_EVENT_SCOPES.includes(scope)) {
    throw new HttpError(400, `scope must be one of ${ADMIN_EVENT_SCOPES.join(', ')}`);
  }
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  if (q.length > MAX_SEARCH_LENGTH) throw new HttpError(400, `q must be ${MAX_SEARCH_LENGTH} characters or fewer`);
  return {
    scope,
    q,
    page: parseBoundedInteger(params.page, { name: 'page', fallback: 1, min: 1, max: MAX_PAGE }),
    pageSize: parseBoundedInteger(params.pageSize, {
      name: 'pageSize', fallback: ADMIN_EVENTS_DEFAULT_PAGE_SIZE, min: 1, max: ADMIN_EVENTS_MAX_PAGE_SIZE,
    }),
  };
}

function londonDayBounds(now) {
  const todayKey = londonDateKey(now.getTime());
  const [year, month, day] = todayKey.split('-').map(Number);
  return {
    todayKey,
    todayStart: new Date(londonMidnightUtc(year, month, day)),
    tomorrowStart: new Date(londonMidnightUtc(year, month, day + 1)),
  };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Mongo filter and sort for an admin scope, judged by UK calendar day: upcoming starts after
 * today; current spans today; past ended before today; all is everything.
 */
export function buildAdminEventsQuery({ scope, q }, now = new Date()) {
  const { todayStart, tomorrowStart } = londonDayBounds(now);
  const clauses = [];
  if (scope === 'upcoming') clauses.push({ event_start_date: { $gte: tomorrowStart } });
  if (scope === 'current') clauses.push({ event_start_date: { $lt: tomorrowStart } }, { event_end_date: { $gte: todayStart } });
  if (scope === 'past') clauses.push({ event_end_date: { $lt: todayStart } });
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    clauses.push({ $or: [{ event_name: pattern }, { event_details: pattern }] });
  }
  const filter = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { $and: clauses };
  // Soonest first for what is ahead or running; most recent first for history and the full list.
  const sort = scope === 'upcoming' || scope === 'current'
    ? { event_start_date: 1, _id: 1 }
    : scope === 'past'
      ? { event_end_date: -1, _id: -1 }
      : { event_start_date: -1, _id: -1 };
  return { filter, sort };
}

function eventTiming(startKey, endKey, todayKey) {
  if (startKey && startKey > todayKey) return 'upcoming';
  if (endKey && endKey < todayKey) return 'past';
  if (startKey && endKey) return 'current';
  return 'unknown';
}

/** Editor representation: stable string id and UK date-only values that round-trip through the form. */
export function toAdminEvent(doc, now = new Date()) {
  const startDate = toEventDateKey(doc?.event_start_date);
  const endDate = toEventDateKey(doc?.event_end_date);
  return {
    id: doc?._id?.toString?.() ?? '',
    name: doc?.event_name ?? '',
    startDate,
    endDate,
    details: doc?.event_details ?? '',
    timing: eventTiming(startDate, endDate, londonDateKey(now.getTime())),
  };
}

/** Admin browse of past, current and future events with optional text search and bounded paging. */
export async function listAdminEvents(params = {}, now = new Date()) {
  const query = parseAdminEventsQuery(params);
  const { filter, sort } = buildAdminEventsQuery(query, now);
  const { db } = await connectToDatabase();
  const collection = db.collection(COLLECTION);
  const [total, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter).sort(sort).skip((query.page - 1) * query.pageSize).limit(query.pageSize).toArray(),
  ]);
  return {
    events: docs.map((doc) => toAdminEvent(doc, now)),
    scope: query.scope,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Always inserts a new event; an existing event with the same name is never matched or changed. */
export async function createEvent(input) {
  if (isPlainObject(input) && input.id !== undefined && input.id !== null && input.id !== '') {
    throw new HttpError(400, 'A new event cannot carry an id; edit the existing event instead');
  }
  const event = validateEventInput(input);
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).insertOne(event);
  if (!result?.acknowledged || !result.insertedId) throw new HttpError(500, 'Event was not created');
  return toAdminEvent({ _id: result.insertedId, ...event });
}

/** Updates exactly the event with this id. An unknown id is a 404 and never creates a document. */
export async function updateEventById(id, input) {
  const _id = parseEventId(id);
  const event = validateEventInput(input);
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).updateOne({ _id }, { $set: event }, { upsert: false });
  if (!result?.acknowledged) throw new HttpError(500, 'Event was not updated');
  if (result.matchedCount !== 1) throw new HttpError(404, 'Event not found');
  return { event: toAdminEvent({ _id, ...event }), changed: result.modifiedCount === 1 };
}

/** Deletes exactly the event with this id; an unknown id is a 404. */
export async function deleteEventById(id) {
  const _id = parseEventId(id);
  const { db } = await connectToDatabase();
  const result = await db.collection(COLLECTION).deleteOne({ _id });
  if (result?.deletedCount !== 1) throw new HttpError(404, 'Event not found');
  return { id: _id.toString() };
}
