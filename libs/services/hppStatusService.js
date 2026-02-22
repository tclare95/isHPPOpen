import { connectToDatabase } from '../database';

const intervals = {
  7: 7,
  28: 28,
  182: 182,
  365: 365,
};

const DAY_MS = 1000 * 60 * 60 * 24;
const intervalKeys = Object.keys(intervals);

const buildIntervalStarts = (currentDate) =>
  intervalKeys.reduce((accumulator, interval) => {
    accumulator[interval] = new Date(currentDate.getTime() - intervals[interval] * DAY_MS);
    return accumulator;
  }, {});

const calculateDaysBetween = (startDate, endDate) =>
  Math.ceil((endDate - startDate) / DAY_MS);

const updateClosures = (closures, interval, intervalStart, closureStart, recordDate) => {
  const overlapStart = new Date(Math.max(closureStart.getTime(), intervalStart.getTime()));
  const overlapEnd = recordDate;
  const overlapDays = calculateDaysBetween(overlapStart, overlapEnd);

  if (overlapDays > 0) {
    closures[interval] += overlapDays;
  }
};

const processRecords = (sortedRecords, currentDate = new Date()) => {
  const closures = { 7: 0, 28: 0, 182: 0, 365: 0 };
  let closureStart = null;
  const intervalStarts = buildIntervalStarts(currentDate);

  sortedRecords.forEach((record) => {
    const recordDate = new Date(record.timestamp);

    if (Number.isNaN(recordDate.getTime())) {
      return;
    }

    if (!record.value && closureStart === null) {
      closureStart = recordDate;
    } else if (record.value && closureStart !== null) {
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
});

export async function getHppStatusSnapshot() {
  const { db } = await connectToDatabase();
  const collection = await db.collection('openIndicator');

  const currentDate = new Date();
  const oneYearAgo = new Date(new Date().setFullYear(currentDate.getFullYear() - 1));

  const records = await collection.find({ timestamp: { $gte: oneYearAgo } }).toArray();
  const sortedRecords = records
    .filter((record) => !Number.isNaN(new Date(record?.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (sortedRecords.length === 0) {
    return {
      data: buildEmptyStatusPayload(),
      context: { isEmpty: true, hasClosureRecord: false },
    };
  }

  const closures = processRecords(sortedRecords, currentDate);
  const latestRecord = sortedRecords[sortedRecords.length - 1];
  const lastClosureRecord = [...sortedRecords].reverse().find((record) => record.value === false);

  if (!lastClosureRecord) {
    return {
      data: {
        isEmpty: false,
        currentStatus: latestRecord?.value ?? null,
        lastChangedAt: null,
        lastChangedDate: null,
        effectiveLastOpenAt: null,
        effectiveLastOpenDate: null,
        closuresInLast7Days: Math.min(closures['7'], 7),
        closuresInLast28Days: Math.min(closures['28'], 28),
        closuresInLast182Days: Math.min(closures['182'], 182),
        closuresInLast365Days: Math.min(closures['365'], 365),
      },
      context: { isEmpty: false, hasClosureRecord: false },
    };
  }

  const lastChangedAt = new Date(lastClosureRecord.timestamp).toISOString();

  return {
    data: {
      isEmpty: false,
      currentStatus: latestRecord?.value ?? null,
      lastChangedAt,
      lastChangedDate: lastChangedAt.slice(0, 10),
      effectiveLastOpenAt: lastChangedAt,
      effectiveLastOpenDate: lastChangedAt.slice(0, 10),
      closuresInLast7Days: Math.min(closures['7'], 7),
      closuresInLast28Days: Math.min(closures['28'], 28),
      closuresInLast182Days: Math.min(closures['182'], 182),
      closuresInLast365Days: Math.min(closures['365'], 365),
    },
    context: { isEmpty: false, hasClosureRecord: true },
  };
}
