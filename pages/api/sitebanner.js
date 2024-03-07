import { getServerSession } from "next-auth/next";
import { connectToDatabase } from '../../libs/database';
import { authOptions } from "./auth/[...nextauth]";
import { ObjectID } from 'mongodb';

export default async function handler(req, res) {
    const { method } = req;
    const session = await getServerSession(req, res, authOptions);

    try {
        const { db } = await connectToDatabase();
        const collection = db.collection('sitebannerschemas');

        switch (method) {
            case 'GET':
                const data = await collection.find({}).toArray();
                res.status(200).json(data);
                break;
            case 'POST':
                if (!session) {
                    return res.status(403).json({ message: "Unauthorized" });
                }

                // Assuming req.body is already parsed by Next.js
                const { banner_message, banner_start_date, banner_end_date } = req.body;
                const update = {
                    $set: {
                        banner_message,
                        banner_update_date: new Date(),
                        banner_start_date: new Date(banner_start_date),
                        banner_end_date: new Date(banner_end_date),
                    },
                };
                const options = { upsert: true };
                const result = await collection.updateOne({}, update, options);
                res.status(200).json(result);
                break;
            default:
                res.setHeader('Allow', ['GET', 'POST'])
                res.status(405).end(`Method ${method} Not Allowed`);
        }
    } catch (error) {
        console.error(error); // Log the error for debugging purposes
        res.status(500).json({ message: "Internal Server Error" });
    }
}
