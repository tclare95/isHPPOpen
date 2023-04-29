import { connectToDatabase } from '../../libs/database'
import { getSession } from 'next-auth/react'
const ObjectID = require('mongodb').ObjectID;
let now

module.exports = async (req, res) => {
    const {method, body} = req
    const session = await getSession({ req })
    switch (method) {
        case 'GET':
            try {
                // read the query param to get the number of events to return. If it is not set, return 5
                let limit = 5
                if (req.query) {
                    limit = parseInt(req.query.limit)
                }
                const { db } = await connectToDatabase();
                now = new Date();
                const collection = await db.collection('eventschemas');
                console.log(now);
                const count = await collection.find({"event_end_date":{$gte : now}}).count();
                const data = await collection.find({"event_end_date":{$gte : now}}).limit(limit).toArray();
                const returnBody = {
                    count: count,
                    eventsArray: data
                }
                res.status(200).json(returnBody)
            } catch (error) {
                console.log(error)
            }
            break
        case 'POST':
            const request = JSON.parse(Object.keys(body)[0])
            if (session) {
                try {
                    const oID = new ObjectID(request.new_event_id)
                    const query = {_id: ObjectID(oID)};
                    const update = {$set: {event_name: request.new_event_name, event_start_date: new Date(request.new_event_start_date), event_end_date: new Date(request.new_event_end_date), event_details: request.new_event_details}};
                    const options = { upsert: true };
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('eventschemas');
                    const result = await collection.updateOne(query, update, options);
                    if (true) {
                        res.status(200).json({
                            message: 'Update successful',
                            id: request.new_event_id
                        })
                    } else {
                    // send an error message if the update fails
                        res.status(500).json({
                            message: 'Update failed',
                            id: request.new_event_id
                        })}
                } catch (error) {
                    console.log('Error modifying event ' + error)
                }
            } else {
                res.status(403).json({
                    message: 'You must be sign in to view the protected content on this page.',
                })
            }
            break

        case 'DELETE':
            const id =  Object.keys(req.query)[0]
            if(session) {
                try {
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('eventschemas');
                    const result = await collection.deleteOne({'_id': new ObjectID(id)})
                    if(result.deletedCount === 1) {
                        res.status(202).send({success: true});
                    } else {
                        res.status(404);
                        res.send({error: "Event Not Found"})
                    }
                    
                } catch (error) {
                    console.log(error)
                    res.status(404);
                    res.send({error: "Event Not Found"})
                }
            } else {
                res.status(403).json({
                    message: 'You must be sign in to view the protected content on this page.',
                })
            }
            break
    }
    
    
}