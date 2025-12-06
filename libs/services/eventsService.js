import { connectToDatabase } from '../database';
import { ObjectId } from 'mongodb';
import * as yup from 'yup';

const eventSchema = yup.object({
  new_event_name: yup.string().required(),
  new_event_start_date: yup.date().required(),
  new_event_end_date: yup.date().required(),
  new_event_details: yup.string().required(),
  new_event_id: yup.string().optional(),
});

export async function fetchUpcomingEvents(limit = 5) {
  const { db } = await connectToDatabase();
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const collection = db.collection('eventschemas');
  const data = await collection
    .find({ event_end_date: { $gte: now } })
    .limit(limit)
    .sort({ event_start_date: 1 })
    .toArray();
  return { count: data.length, eventsArray: data };
}

export async function upsertEvent(eventData) {
  const parsed = await eventSchema.validate(eventData);
  const { db } = await connectToDatabase();
  const collection = db.collection('eventschemas');
  const query = { event_name: parsed.new_event_name };
  const update = {
    $set: {
      event_name: parsed.new_event_name,
      event_start_date: new Date(parsed.new_event_start_date),
      event_end_date: new Date(parsed.new_event_end_date),
      event_details: parsed.new_event_details,
    },
  };
  const options = { upsert: true };
  return collection.updateOne(query, update, options);
}

export async function deleteEventById(id) {
  const { db } = await connectToDatabase();
  const collection = db.collection('eventschemas');
  return collection.deleteOne({ _id: new ObjectId(id) });
}
