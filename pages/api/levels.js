import { connectToDatabase } from '../../libs/database'
import { getMethodHandler, mapApiError } from '../../libs/api/http'

export default async function handler(req, res) {
    const timestamp = new Date().toISOString();
    const handlers = {
        GET: async () => {
            const { db } = await connectToDatabase();
            const collection = await db.collection('riverschemas');
            const cursor = await collection.find().sort({ '_id': -1 }).limit(1);
            const data = await cursor.next();
            console.log(`${timestamp} LEVELS CALLED`);
            res.status(200).json({
                level_data: data.level_readings,
                forecast_data: data.forecast_readings,
            });
        },
    };

    try {
        const methodHandler = getMethodHandler(req, res, handlers);
        if (!methodHandler) {
            return;
        }

        await methodHandler();
    } catch (error) {
        const { statusCode, message } = mapApiError(error);
        console.error(`[${timestamp}] Error in levels:`, error);
        res.status(statusCode).json({ message });
    }
}