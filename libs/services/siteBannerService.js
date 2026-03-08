import { connectToDatabase } from '../database';
import * as yup from 'yup';

function optionalDate() {
  return yup.date().transform((value, originalValue) => {
    if (originalValue === '' || originalValue === null || originalValue === undefined) {
      return null;
    }

    return value;
  }).nullable();
}

const bannerSchema = yup.object({
  banner_title: yup.string().trim().max(120).default(''),
  banner_message: yup.string().trim().default(''),
  banner_enabled: yup.boolean().default(false),
  banner_start_date: optionalDate(),
  banner_end_date: optionalDate().test(
    'banner-end-date-after-start',
    'Banner end date must be after the start date',
    function validateEndDate(value) {
      if (value === null) {
        return true;
      }

      const { banner_start_date: startDate } = this.parent;
      if (startDate === null) {
        return true;
      }

      return value >= startDate;
    },
  ),
}).test({
  name: 'banner-message-when-enabled',
  message: 'Banner message is required when the banner is enabled',
  test(value) {
    if (!value?.banner_enabled) {
      return true;
    }

    return Boolean(value.banner_message?.trim());
  },
});

export async function getBanners() {
  const { db } = await connectToDatabase();
  const collection = db.collection('sitebannerschemas');
  return collection.find({}).toArray();
}

export async function upsertBanner(data) {
  const parsed = await bannerSchema.validate({
    banner_title: '',
    banner_message: '',
    banner_enabled: false,
    ...data,
  });
  const { db } = await connectToDatabase();
  const collection = db.collection('sitebannerschemas');
  const update = {
    $set: {
      banner_title: parsed.banner_title,
      banner_message: parsed.banner_message,
      banner_enabled: parsed.banner_enabled,
      banner_update_date: new Date(),
      banner_start_date: parsed.banner_start_date ? new Date(parsed.banner_start_date) : null,
      banner_end_date: parsed.banner_end_date ? new Date(parsed.banner_end_date) : null,
    },
  };
  const options = { upsert: true };
  return collection.updateOne({}, update, options);
}
