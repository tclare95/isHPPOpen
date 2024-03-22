import { connectToDatabase } from "../../libs/database";

const intervals = {
  7: 7,
  28: 28,
  182: 182,
  365: 365,
};

// Utility function to calculate days between dates
const calculateDaysBetween = (startDate, endDate) =>
  Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

// Determines if a date is before another date
const isBefore = (date, comparisonDate) => date < comparisonDate;

// Determines if a date is after another date
const isAfter = (date, comparisonDate) => date > comparisonDate;

// Updates closure counts
const updateClosures = (
  closures,
  interval,
  intervalStart,
  closureStart,
  recordDate
) => {
  let overlapStart =
    closureStart < intervalStart ? intervalStart : closureStart;
  let overlapEnd = recordDate;
  let overlapDays = calculateDaysBetween(overlapStart, overlapEnd);

  // Ensure we only add positive day counts
  if (overlapDays > 0) {
    closures[interval] += overlapDays;
  }
};

// Processes sorted records to calculate closures
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
        if (
          isBefore(closureStart, intervalStart) &&
          isAfter(recordDate, intervalStart)
        ) {
          updateClosures(
            closures,
            interval,
            intervalStart,
            closureStart,
            recordDate
          );
        } else if (isAfter(closureStart, intervalStart)) {
          updateClosures(
            closures,
            interval,
            intervalStart,
            closureStart,
            recordDate
          );
        }
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
      updateClosures(
        closures,
        interval,
        intervalStart,
        closureStart,
        currentDate
      );
    });
  } else if (sortedRecords[sortedRecords.length - 1].value === true) {
    // If the last record is true, consider the time since the last record to now as open, which may affect closure calculations
    const lastRecordDate = new Date(
      sortedRecords[sortedRecords.length - 1].timestamp
    );
    if (lastRecordDate.toDateString() === new Date().toDateString()) {
      // This means the last open status was today, consider adjustments for counting today as open
      Object.keys(intervals).forEach((interval) => {
        const intervalStart = new Date(
          currentDate.getTime() - intervals[interval] * 24 * 60 * 60 * 1000
        );
        if (isAfter(currentDate, intervalStart)) {
          // Adjust closure calculations here if necessary
          // Since today is considered open, you might want to adjust how this day is counted in closures
        }
      });
    }
  }

  return closures;
};

const adjustEffectiveLastOpenDate = (lastOpenDate, currentStatus) => {
  const now = new Date();
  if (lastOpenDate.getHours() >= 15) {
    lastOpenDate.setDate(lastOpenDate.getDate() + 1);
  }
  // If the last status is true and the last open date is yesterday, consider today as the effective last open date
  if (
    currentStatus === true &&
    lastOpenDate.toDateString() === new Date().toDateString()
  ) {
    lastOpenDate = now;
  }
  return lastOpenDate;
};

export default async function handler(req, res) {
  const timestamp = new Date().toISOString();

  try {
    const { db } = await connectToDatabase();
    const collection = await db.collection("openIndicator");

    const currentDate = new Date();
    const oneYearAgo = new Date(new Date().setFullYear(currentDate.getFullYear() - 1));
    
    const records = await collection
      .find({ timestamp: { $gte: oneYearAgo } })
      .toArray();
    const sortedRecords = records.sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    if (sortedRecords.length === 0) {
      return res
        .status(500)
        .json({
          error:
            "No records found in the database for the specified date range.",
        });
    }

    if (!sortedRecords[0].hasOwnProperty("value")) {
      return res
        .status(500)
        .json({
          error: "The first record doesn't contain a 'value' property.",
        });
    }

    const closures = processRecords(sortedRecords, intervals);
    const lastOpenRecord = sortedRecords
      .reverse()
      .find((record) => record.value === true);
    let effectiveLastOpenDate = adjustEffectiveLastOpenDate(
      new Date(lastOpenRecord.timestamp)
    );

    console.log(timestamp + " HPPSTATUS CALLED");

    res.status(200).json({
      currentStatus: sortedRecords[sortedRecords.length - 1].value,
      lastChangedDate: sortedRecords[sortedRecords.length - 1].timestamp,
      effectiveLastOpenDate: effectiveLastOpenDate.toISOString().slice(0, 10),
      closuresInLast7Days: closures["7"],
      closuresInLast28Days: closures["28"],
      closuresInLast182Days: closures["182"],
      closuresInLast365Days: closures["365"],
    });
  } catch (error) {
    console.error(timestamp + " " + error);
    res.status(500).json({ error: error });
  }
}
