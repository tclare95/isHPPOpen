import HomePage from '../components/pages/home-page';
import { connectToDatabase } from '../libs/database';

export const revalidate = 900;

export const metadata = {
  title: 'Is HPP Open',
};

async function getHomePageData() {
  let events = [];
  let message = { banner_message: '' };

  try {
    const { db } = await connectToDatabase();
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() - 1);

    const eventData = await db
      .collection('eventschemas')
      .find({ event_end_date: { $gte: tomorrow } })
      .limit(5)
      .toArray();

    events = JSON.parse(JSON.stringify(eventData));

    const messageData = await db.collection('sitebannerschemas').findOne();
    if (messageData) {
      message = JSON.parse(JSON.stringify(messageData));
    }
  } catch (error) {
    console.error('Failed to load home page data', error);
  }

  return { events, message };
}

export default async function Home() {
  const { events, message } = await getHomePageData();
  return <HomePage events={events} message={message} />;
}
