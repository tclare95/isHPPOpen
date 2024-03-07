import { getServerSession } from "next-auth/next"
import { connectToDatabase } from '../../libs/database'
import { authOptions } from "./auth/[...nextauth]"
import { ObjectID } from 'mongodb';



export default async function handler(req, res) {
    const { method, body } = req;
    const session = await getServerSession(req, res, authOptions)

    switch (method) {
        case 'GET':
            // get the current site banner message
            try {
                const { db } = await connectToDatabase();
            const collection = await db.collection('sitebannerschemas');

            const data = await collection
                .find()
                .toArray();
            res.status(200).json(data);
            } catch {
                res.status(500).json({ message: "Error getting site banner data" });
            }
            
            break;
        case 'POST':
            // check if the user is authenticated, if not, return a 403
            // if the user is authenticated, update the site banner message
            if (session) {
                try {
                    const request = JSON.parse(Object.keys(body)[0]);
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('sitebannerschemas');
                    const query = { _id: ObjectID(request._id) };
                    const update = {
                        $set: {
                            banner_message: request.banner_message,
                            banner_update_date: new Date(),
                            banner_start_date: new Date(request.banner_start_date),
                            banner_end_date: new Date(request.banner_end_date),
                        },
                    };
                    const options = { upsert: true };
                    const result = await collection.updateOne(query, update, options);
                    res.status(200).json(result);
                } catch {
                    res.status(500).json({ message: "Error updating site banner data" });
                }
                
            } else {
                res.status(403).json({ message: "Unauthorized" });
            }
            break;
        default:
            res.setHeader('Allow', ['GET', 'POST'])
            res.status(405).end(`Method ${method} Not Allowed`);
    }
}