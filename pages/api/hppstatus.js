import { connectToDatabase } from '../../libs/database'

// This api route returns the open status of HPP. It returns a JSON object with the following information: a boolean representing the current state of HPP, 
// a string for the date that this changed
// the number of days since HPP was last open, and the percentage of days that HPP has been open in the last 30 days, 
// and the percentage of days that HPP has been open since 01/01/2022.

module.exports = async (req, res) => {
    try {
        const { db } = await connectToDatabase();
        const collection = await db.collection('openIndicator');
        // get the most recent document in the collection, sorting by readingDate
        const cursor = await collection.find().sort({ 'readingDate': -1 }).limit(1);
        const data = await cursor.next();
        // parse the readingDate string into a date object, and calculate how many days since HPP was last open
        const lastChangedDate = new Date(data.readingDate);
        const daysSinceLastOpen = Math.floor((new Date() - lastChangedDate) / (1000 * 60 * 60 * 24))+1;

        // the effective last open date takes into account the opening hours of hpp. If the last readingDate was after 3pm and before 10AM, 
        // then the effective last open date is the previous day
        let effectiveLastOpenDate = lastChangedDate;
        if (lastChangedDate.getHours() > 15 || lastChangedDate.getHours() < 10) {
            effectiveLastOpenDate = new Date(lastChangedDate.setDate(lastChangedDate.getDate() - 1));
        }

        // calculate the percentage of days that HPP has been open in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoOpenIndicator = await collection.find({ 'readingDate': { $gte: thirtyDaysAgo } }).toArray();
        const thirtyDaysAgoOpenIndicatorCount = thirtyDaysAgoOpenIndicator.filter((item) => item.openIndicatorField === true).length;
        const thirtyDaysAgoOpenIndicatorPercentage = Math.round((thirtyDaysAgoOpenIndicatorCount / 30) * 100);

        // calculate the percentage of days that HPP has been open since 01/01/2022
        const startDate = new Date('2022-01-01');
        const startDateOpenIndicator = await collection.find({ 'readingDate': { $gte: startDate } }).toArray();
        const startDateOpenIndicatorCount = startDateOpenIndicator.filter((item) => item.openIndicatorField === true).length;
        const startDateOpenIndicatorPercentage = Math.round((startDateOpenIndicatorCount / 30) * 100);



        res.status(200).json({
            currentStatus: data.openIndicatorField,
            lastChangedDate: data.readingDate,
            daysSinceLastOpen: daysSinceLastOpen,
            effectiveLastOpenDate: effectiveLastOpenDate.toISOString().slice(0, 10),
            thirtyDaysAgoOpenIndicatorPercentage: thirtyDaysAgoOpenIndicatorPercentage,
            startDateOpenIndicatorPercentage: startDateOpenIndicatorPercentage
        });
    } catch (error) {
        console.log(error)
    }
}