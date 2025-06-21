import { connectToDatabase } from '../database';
import * as yup from 'yup';

const bannerSchema = yup.object({
  banner_message: yup.string().required(),
  banner_start_date: yup.date().required(),
  banner_end_date: yup.date().required(),
});

export async function getBanners() {
  const { db } = await connectToDatabase();
  const collection = db.collection('sitebannerschemas');
  return collection.find({}).toArray();
}

export async function upsertBanner(data) {
  const parsed = await bannerSchema.validate(data);
  const { db } = await connectToDatabase();
  const collection = db.collection('sitebannerschemas');
  const update = {
    $set: {
      banner_message: parsed.banner_message,
      banner_update_date: new Date(),
      banner_start_date: new Date(parsed.banner_start_date),
      banner_end_date: new Date(parsed.banner_end_date),
    },
  };
  const options = { upsert: true };
  return collection.updateOne({}, update, options);
}
