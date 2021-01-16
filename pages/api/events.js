import { connectToDatabase } from '../../libs/database'

module.exports = async (req, res) => {
     
    try {
        const { db } = await connectToDatabase();
        const now = new Date
        const collection = await db.collection('eventschemas');
        const data = await collection.find({"event_end_date":{$gte : now}}).limit(5).toArray();
        res.status(200).json(data)
    } catch (error) {
        console.log(error)
    }
    
}