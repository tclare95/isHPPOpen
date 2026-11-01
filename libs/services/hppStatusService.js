import { connectToDatabase } from '../database';
import { buildOperationalHealth } from "../operationalHealth";

const intervals = {
  7: 7,
  28: 28,
  182: 182,
  365: 365,
};

const DAY_MS = 1000 * 60 * 60 * 24;
const intervalKeys = Object.keys(intervals);
const HISTORY_WINDOW_DAYS = Math.max(...Object.values(intervals));

const buildIntervalStarts = (currentDate) =>
  intervalKeys.reduce((accumulator, interval) => {
    accumulator[interval] = new Date(currentDate.getTime() - intervals[interval] * DAY_MS);
    return accumulator;
  }, {});

// The earliest window start. Records before it only matter as the status
// carried into the windows, so only the latest one is read.
export const getHistoryWindowStart = (currentDate) =>
  new Date(currentDate.getTime() - HISTORY_WINDOW_DAYS * DAY_MS);

const calculateDaysBetween = (startDate, endDate) =>
  Math.ceil((endDate - startDate) / DAY_MS);

// openIndicator records are written by the scraper as { timestamp, value: boolean }.
// Anything else cannot say whether HPP was open or closed, so it is ignored
// rather than being read as a closure.
const toValidRecord = (record) => {
  const date = new Date(record?.timestamp);
  if (Number.isNaN(date.getTime()) || typeof record?.value !== 'boolean') {
    return null;
  }
  return { date, value: record.value };
};

const updateClosures = (closures, interval, intervalStart, closureStart, recordDate) => {
  const overlapStart = new Date(Math.max(closureStart.getTime(), intervalStart.getTime()));
  const overlapEnd = recordDate;
  const overlapDays = calculateDaysBetween(overlapStart, overlapEnd);

  if (overlapDays > 0) {
    closures[interval] += overlapDays;
  }
};

// Expects valid records in ascending order, starting with the record carried
// in from before the earliest window (when one exists). Each closure is
// clipped to every window start, so each window inherits the status in force
// at its own start.
const processRecords = (sortedRecords, currentDate) => {
  const closures = { 7: 0, 28: 0, 182: 0, 365: 0 };
  let closureStart = null;
  const intervalStarts = buildIntervalStarts(currentDate);

  sortedRecords.forEach(({ date: recordDate, value }) => {
    if (!value && closureStart === null) {
      closureStart = recordDate;
    } else if (value && closureStart !== null) {
      intervalKeys.forEach((interval) => {
        updateClosures(closures, interval, intervalStarts[interval], closureStart, recordDate);
      });
      closureStart = null;
    }
  });

  if (closureStart !== null) {
    intervalKeys.forEach((interval) => {
      updateClosures(closures, interval, intervalStarts[interval], closureStart, currentDate);
    });
  }

  return closures;
};

/**
 * Derive the public HPP status fields from openIndicator transitions.
 *
 * `records` should contain every record inside the 365-day history window plus
 * the latest record before it (the carried-in status). Returns null when no
 * valid record exists.
 */
export function calculateHppStatus(records, currentDate = new Date()) {
  const sortedRecords = records
    .map(toValidRecord)
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  if (sortedRecords.length === 0) {
    return null;
  }

  const closures = processRecords(sortedRecords, currentDate);
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const lastClosureRecord = [...sortedRecords].reverse().find((record) => record.value === false);
  const lastChangedAt = lastClosureRecord ? lastClosureRecord.date.toISOString() : null;
  const lastChangedDate = lastChangedAt ? lastChangedAt.slice(0, 10) : null;

  return {
    currentStatus: latestRecord.value,
    lastChangedAt,
    lastChangedDate,
    effectiveLastOpenAt: lastChangedAt,
    effectiveLastOpenDate: lastChangedDate,
    closuresInLast7Days: Math.min(closures['7'], 7),
    closuresInLast28Days: Math.min(closures['28'], 28),
    closuresInLast182Days: Math.min(closures['182'], 182),
    closuresInLast365Days: Math.min(closures['365'], 365),
  };
}

export const buildEmptyStatusPayload = () => ({
  isEmpty: true,
  currentStatus: null,
  lastChangedAt: null,
  lastChangedDate: null,
  effectiveLastOpenAt: null,
  effectiveLastOpenDate: null,
  closuresInLast7Days: 0,
  closuresInLast28Days: 0,
  closuresInLast182Days: 0,
  closuresInLast365Days: 0,
  health: buildOperationalHealth({ source: "mongodb-hpp-status", unavailable: true }),
});

export async function getHppStatusSnapshot({ now = new Date() } = {}) {
  const { db } = await connectToDatabase();
  const collection = await db.collection('openIndicator');

  const currentDate = now;
  const historyStart = getHistoryWindowStart(currentDate);

  // Two bounded reads: the in-window transitions, and the single most recent
  // valid transition before the window, which supplies the carried-in status.
  const [windowRecords, carriedInRecord] = await Promise.all([
    collection.find({ timestamp: { $gte: historyStart } }).toArray(),
    collection.findOne(
      { timestamp: { $lt: historyStart }, value: { $in: [true, false] } },
      { sort: { timestamp: -1 } },
    ),
  ]);

  // HPP records are written only when the 2.2m boundary changes. A successful
  // query is therefore the freshness signal; lastChangedAt remains the user-facing
  // timestamp for the actual status transition.
  const health = buildOperationalHealth({ source: "mongodb-hpp-status", generatedAt: currentDate, fetchedAt: currentDate });
  const status = calculateHppStatus(
    carriedInRecord ? [carriedInRecord, ...windowRecords] : windowRecords,
    currentDate,
  );

  if (!status) {
    return {
      data: { ...buildEmptyStatusPayload(), health },
      context: { isEmpty: true, hasClosureRecord: false },
    };
  }

  return {
    data: { isEmpty: false, ...status, health },
    context: { isEmpty: false, hasClosureRecord: status.lastChangedAt !== null },
  };
}
