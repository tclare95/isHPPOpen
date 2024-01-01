import { connectToDatabase } from '../../libs/database';

export default async function handler(req, res) {
    const timestamp = new Date().toISOString();

    try {
        const { db } = await connectToDatabase();
        const collection = await db.collection('openIndicator');

        const intervals = {
            "7": 7,
            "28": 28,
            "182": 182,
            "365": 365
        };

        const closures = {
            "7": 0,
            "28": 0,
            "182": 0,
            "365": 0
        };

        const currentDate = new Date();
        const oldestDate = new Date();
        oldestDate.setDate(currentDate.getDate() - 365);

        const records = await collection.find({ 'timestamp': { $gte: oldestDate } }).toArray();
        const sortedRecords = records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (sortedRecords.length === 0) {
            return res.status(500).json({ error: "No records found in the database for the specified date range." });
        }

        if (!sortedRecords[0].hasOwnProperty('value')) {
            return res.status(500).json({ error: "The first record doesn't contain a 'value' property." });
        }

        let closureStart = null;
        const mostRecentRecord = sortedRecords[sortedRecords.length - 1];

        for (let record of sortedRecords) {
            const recordDate = new Date(record.timestamp);

            if (record.value === false && closureStart === null) {
                closureStart = recordDate;
            } else if (record.value === true && closureStart !== null) {
                // Calculate overlapping days for each interval
                for (let interval in intervals) {
                    let intervalStart = new Date(currentDate.getTime() - intervals[interval] * (1000 * 60 * 60 * 24));
                    if (closureStart < currentDate && intervalStart < recordDate) {
                        let overlapStart = closureStart > intervalStart ? closureStart : intervalStart;
                        let overlapEnd = recordDate < currentDate ? recordDate : currentDate;
                        let overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));

                        closures[interval] += overlapDays;
                    }
                }
                closureStart = null;
            }
        }

        // Handle ongoing closure
        if (closureStart !== null) {
            for (let interval in intervals) {
                let intervalStart = new Date(currentDate.getTime() - intervals[interval] * (1000 * 60 * 60 * 24));
                if (closureStart < intervalStart) {
                    let overlapDays = Math.round((currentDate - intervalStart) / (1000 * 60 * 60 * 24));
                    closures[interval] += overlapDays;
                }
            }
        }

        const lastOpenRecord = sortedRecords.reverse().find(record => record.value === true);
        let effectiveLastOpenDate = new Date(lastOpenRecord.timestamp);
        if (effectiveLastOpenDate.getHours() >= 15) {
            effectiveLastOpenDate.setDate(effectiveLastOpenDate.getDate() + 1);
        }

        console.log(timestamp + ' HPPSTATUS CALLED');

        res.status(200).json({
            currentStatus: mostRecentRecord.value,
            lastChangedDate: mostRecentRecord.timestamp,
            effectiveLastOpenDate: effectiveLastOpenDate.toISOString().slice(0, 10),
            closuresInLast7Days: closures["7"],
            closuresInLast28Days: closures["28"],
            closuresInLast182Days: closures["182"],
            closuresInLast365Days: closures["365"]
        });
    } catch (error) {
        console.log('Error: ', error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
}
