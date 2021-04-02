import { connectToDatabase } from '../../libs/database'
import { getSession } from 'next-auth/client'
const ObjectID = require('mongodb').ObjectID;


module.exports = async (req, res) => {
    const {method, body} = req
    const session = await getSession({ req })
    switch (method) {
        case 'GET':
            try {
                const { db } = await connectToDatabase();
                const now = new Date
                const collection = await db.collection('eventschemas');
                const data = await collection.find({"event_end_date":{$gte : now}}).limit(5).toArray();
                res.status(200).json(data)
            } catch (error) {
                console.log(error)
            }
            break
        case 'POST':
            const request = JSON.parse(Object.keys(body)[0])
            console.log(request)
            if (session) {
                try {
                    const query = {event_name: request.new_event_name};
                    const update = {$set: {event_name: request.new_event_name, event_start_date: new Date(request.new_event_start_date), event_end_date: new Date(request.new_event_end_date), event_details: request.new_event_details}};
                    const options = { upsert: true };
                    const { db } = await connectToDatabase();
                    const collection = await db.collection('eventschemas');
                    collection.updateOne(query, update, options);
                    console.log('success')
                    res.status(200).json({
                        message: 'Update successful',
                        id: request.new_event_id
                    })
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
                        res.status(204).send({success: true});
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