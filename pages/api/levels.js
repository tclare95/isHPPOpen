import { connectToDatabase } from '../../libs/database'

module.exports = async (req, res) => {
    try {
        const { db } = await connectToDatabase();
        const collection = await db.collection('riverschemas');
        const cursor = await collection.find().sort({ '_id': -1 }).limit(1);
        const data = await cursor.next();
        res.status(200).json({
            level_data: data.level_readings,
            forecast_data: data.forecast_readings,
        });
    } catch (error) {
        console.log(error)
    }
}