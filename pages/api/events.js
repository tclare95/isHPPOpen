import { getServerSession } from "next-auth/next"
import { connectToDatabase } from '../../libs/database'
import { authOptions } from "./auth/[...nextauth]"


const ObjectID = require('mongodb').ObjectID;

export default async function handler(req, res) {
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
                const count = await collection.countDocuments({
                    event_end_date: { $gte: now },
                });
                const returnBody = {
                    count: count,
                    eventsArray: data,
                };
                console.log(now.toISOString() + ' GETEVENTS CALLED');
                res.status(200).json(returnBody);
            } catch (error) {
                console.log(error);
            }
            break;
        case 'POST':
            const request = JSON.parse(Object.keys(body)[0]);
            console.log(request);
            if (session) {
                const now = new Date();
                try {
                    const query = { event_name: request.new_event_name };
                    const update = {
                        $set: {
                            event_name: request.new_event_name,
                            event_start_date: new Date(request.new_event_start_date),
                            event_end_date: new Date(request.new_event_end_date),
                            event_details: request.new_event_details,
                        },
                    };
                    const options = { upsert: true };
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('eventschemas');
                    const result = await collection.updateOne(query, update, options);
                    if (result.modifiedCount === 1 || result.upsertedCount === 1) {
                        // log userID, objectID and action
                        console.log(
                            now.toISOString() +
                                ' Event modified by ' +
                                session.user.email +
                                ' ' +
                                request.new_event_id
                        );
                        res.status(200).json({
                            message: 'Update successful',
                            id: request.new_event_id,
                        });
                    } else {
                        // send an error message if the update fails
                        console.log(
                            now.toISOString() + ' Update unsuccessful' + request.new_event_id
                        );
                        res.status(500).json({
                            message: 'Update failed',
                            id: request.new_event_id,
                        });
                    }
                } catch (error) {
                    console.log(now.toISOString() + ' Error modifying event ' + error);
                }
            } else {
                res.status(403).json({
                    message:
                        'You must be sign in to view the protected content on this page.',
                });
            }
            break;

        case 'DELETE':
            const id = Object.keys(req.query)[0];
            if (session) {
                try {
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('eventschemas');
                    const result = await collection.deleteOne({ _id: new ObjectID(id) });
                    if (result.deletedCount === 1) {
                        res.status(202).send({ success: true });
                        // log userID and action
                        console.log(
                            now.toISOString() + ' Event deleted by ' + session.user.email + ' ' + id
                        );
                    } else {
                        res.status(404);
                        res.send({ error: 'Event Not Found' });
                    }
                } catch (error) {
                    console.log(error);
                    res.status(404);
                    res.send({ error: 'Event Not Found' });
                }
            } else {
                res.status(403).json({
                    message:
                        'You must be sign in to view the protected content on this page.',
                });
            }
            break;
        default:
            res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
            res.status(405).end(`Method ${method} Not Allowed`);
    }
}