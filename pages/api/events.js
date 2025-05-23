import { getServerSession } from "next-auth/next"
import { connectToDatabase } from '../../libs/database'
import { authOptions } from "./auth/[...nextauth]"
import { ObjectID } from 'mongodb';


export default async function handler(req, res) {
    const timestamp = new Date().toISOString();
    try {
        const { method, body } = req;
        const session = await getServerSession(req, res, authOptions)

        switch (method) {
            case 'GET':
                try {
                    // read the query param to get the number of events to return. If it is not set, return 5
                    let limit = 5;
                    if (req.query) {
                        limit = parseInt(req.query.limit);
                    }
                    const { db } = await connectToDatabase();
                    // get the current date and take one day off to account for timezones
                    const now = new Date();
                    now.setDate(now.getDate() - 1);
                    const collection = await db.collection('eventschemas');

                    const data = await collection
                        .find({ event_end_date: { $gte: now } })
                        .limit(limit)
                        .sort({ event_start_date: 1 })
                        .toArray();
                    const count = data.length;
                    const returnBody = {
                        count: count,
                        eventsArray: data,
                    };
                    console.log(`${timestamp} GETEVENTS CALLED`);
                    res.status(200).json(returnBody);
                } catch (getError) {
                    console.error(`[${timestamp}] GET error in events:`, getError);
                    res.status(500).json({ message: "Internal Server Error" });
                }
                break;
            case 'POST':
                try {
                    const parsedRequest = JSON.parse(Object.keys(body)[0]);
                    console.log(parsedRequest);
                    if (session) {
                        const now = new Date();
                        try {
                            const query = { event_name: parsedRequest.new_event_name };
                            const update = {
                                $set: {
                                    event_name: parsedRequest.new_event_name,
                                    event_start_date: new Date(parsedRequest.new_event_start_date),
                                    event_end_date: new Date(parsedRequest.new_event_end_date),
                                    event_details: parsedRequest.new_event_details,
                                },
                            };
                            const options = { upsert: true };
                            const { db } = await connectToDatabase();
                            const collection = await db.collection('eventschemas');
                            const result = await collection.updateOne(query, update, options);
                            if (result.modifiedCount === 1 || result.upsertedCount === 1) {
                                // log userID, objectID and action
                                console.log(
                                    `${timestamp} Event modified by ${session.user.email} ${parsedRequest.new_event_id}`
                                );
                                res.status(200).json({
                                    message: 'Update successful',
                                    id: parsedRequest.new_event_id,
                                });
                            } else {
                                // send an error message if the update fails
                                console.error(
                                    `${timestamp} Update unsuccessful for event ${parsedRequest.new_event_id}`
                                );
                                res.status(500).json({
                                    message: 'Update failed',
                                    id: parsedRequest.new_event_id,
                                });
                            }
                        } catch (error) {
                            console.error(`[${timestamp}] POST error in events:`, error);
                            res.status(500).json({ message: "Internal Server Error" });
                        }
                    } else {
                        res.status(403).json({
                            message:
                                'You must be sign in to view the protected content on this page.',
                        });
                    }
                } catch (postError) {
                    console.error(`[${timestamp}] POST error in events:`, postError);
                    res.status(500).json({ message: "Internal Server Error" });
                }
                break;

            case 'DELETE':
                try {
                    const { id } = req.query;
                    if (!id) {
                        res.status(400).json({ message: "Missing id parameter" });
                        break;
                    }
                    if (session) {
                        try {
                            const { db } = await connectToDatabase();
                            const collection = await db.collection('eventschemas');
                            const result = await collection.deleteOne({ _id: new ObjectID(id) });
                            if (result.deletedCount === 1) {
                                res.status(202).send({ success: true });
                                // log userID and action
                                console.log(
                                    `${timestamp} Event deleted by ${session.user.email} ${id}`
                                );
                            } else {
                                console.error(`${timestamp} Event not found for deletion: ${id}`);
                                res.status(404).json({ error: 'Event Not Found' });
                            }
                        } catch (error) {
                            console.error(`[${timestamp}] DELETE error in events:`, error);
                            res.status(500).json({ message: "Internal Server Error" });
                        }
                    } else {
                        res.status(403).json({
                            message:
                                'You must be sign in to view the protected content on this page.',
                        });
                    }
                } catch (deleteError) {
                    console.error(`[${timestamp}] DELETE error in events:`, deleteError);
                    res.status(500).json({ message: "Internal Server Error" });
                }
                break;
            default:
                res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
                res.status(405).end(`Method ${method} Not Allowed`);
        }
    } catch (error) {
        console.error(`[${timestamp}] Global error in events handler:`, error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}