import { connectToDatabase } from '../database';
import { buildOperationalHealth } from "../operationalHealth";

import { calculateHppStatus, getHistoryWindowStart } from "../hpp/hppWindows.js";

// The pure window calculation lives in libs/hpp so the HPP status service
// reuses it unchanged (#89). Re-exported for existing callers.
export { calculateHppStatus, getHistoryWindowStart };

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
