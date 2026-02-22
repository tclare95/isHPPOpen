import HomePageClient from "../components/pages/HomePageClient";
import { fetchHomePageSnapshot } from "../libs/services/homePageService";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "../libs/cache/tags";

export const revalidate = 21600;

const getCachedHomePageSnapshot = unstable_cache(
  async () => fetchHomePageSnapshot(),
  ["home-page-snapshot-v1"],
  {
    revalidate,
    tags: [CACHE_TAGS.HOME_SNAPSHOT, CACHE_TAGS.EVENTS, CACHE_TAGS.SITE_BANNER],
  }
);

export default async function HomePage() {
  let snapshot = { events: [], message: { banner_message: "" } };

  try {
    snapshot = await getCachedHomePageSnapshot();
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
