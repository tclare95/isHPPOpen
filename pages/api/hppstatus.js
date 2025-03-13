import { connectToDatabase } from "../../libs/database";

const intervals = {
  7: 7,
  28: 28,
  182: 182,
  365: 365,
};

const calculateDaysBetween = (startDate, endDate) =>
  Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

const updateClosures = (closures, interval, intervalStart, closureStart, recordDate) => {
  const overlapStart = closureStart < intervalStart ? intervalStart : closureStart;
  const overlapEnd = recordDate;
  const overlapDays = calculateDaysBetween(overlapStart, overlapEnd);

  if (overlapDays > 0) {
    closures[interval] += overlapDays;
  }
};

const processRecords = (sortedRecords, intervals) => {
  const closures = { 7: 0, 28: 0, 182: 0, 365: 0 };
  let closureStart = null;
  const currentDate = new Date();

  sortedRecords.forEach((record) => {
    const recordDate = new Date(record.timestamp);
    if (!record.value && closureStart === null) {
      closureStart = recordDate;
    } else if (record.value && closureStart !== null) {
      Object.keys(intervals).forEach((interval) => {
        const intervalStart = new Date(
          currentDate.getTime() - intervals[interval] * 24 * 60 * 60 * 1000
        );
        updateClosures(closures, interval, intervalStart, closureStart, recordDate);
      });
      closureStart = null;
    }
  });

  // Handle ongoing closure
  if (closureStart !== null) {
    Object.keys(intervals).forEach((interval) => {
      const intervalStart = new Date(
        currentDate.getTime() - intervals[interval] * 24 * 60 * 60 * 1000
      );
      updateClosures(closures, interval, intervalStart, closureStart, currentDate);
    });
  }

  return closures;
};

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  try {
    const { db } = await connectToDatabase();
    const collection = await db.collection("openIndicator");

    const currentDate = new Date();
    const oneYearAgo = new Date(new Date().setFullYear(currentDate.getFullYear() - 1));

    const records = await collection.find({ timestamp: { $gte: oneYearAgo } }).toArray();
    const sortedRecords = records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (sortedRecords.length === 0) {
      console.error(`[${timestamp}] No records found in hppstatus`);
      return res.status(500).json({ error: "No records found in the database." });
    }

    const closures = processRecords(sortedRecords, intervals);

    // Find the last record where value is false (i.e., closed)
    const lastClosureRecord = sortedRecords.reverse().find((record) => record.value === false);

    if (!lastClosureRecord) {
      console.error(`[${timestamp}] No closure records found in hppstatus`);
      return res.status(500).json({ error: "No closure records found." });
    }

    const lastChangedDate = new Date(lastClosureRecord.timestamp).toISOString();
    
    console.log(`${timestamp} HPPSTATUS CALLED`);

    res.status(200).json({
      currentStatus: sortedRecords[0].value,
      lastChangedDate: lastChangedDate.slice(0, 10),
      effectiveLastOpenDate: lastChangedDate.slice(0, 10),
      closuresInLast7Days: closures["7"] > 7 ? 7 : closures["7"],
      closuresInLast28Days: closures["28"] > 28 ? 28 : closures["28"],
      closuresInLast182Days: closures["182"] > 182 ? 182 : closures["182"],
      closuresInLast365Days: closures["365"] > 365 ? 365 : closures["365"],
    });
  } catch (error) {
    console.error(`[${timestamp}] Error in hppstatus:`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
