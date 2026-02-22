import HomePageClient from "../components/pages/HomePageClient";
import { fetchHomePageSnapshot } from "../libs/services/homePageService";

export const revalidate = 21600;

export default async function HomePage() {
  let snapshot = { events: [], message: { banner_message: "" } };

  try {
    snapshot = await fetchHomePageSnapshot();
  } catch (error) {
    console.error("Failed to load app router home page data", error);
  }

  return (
    <HomePageClient
      events={snapshot.events}
      message={snapshot.message}
    />
  );
}
