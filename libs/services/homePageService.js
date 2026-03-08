import { fetchUpcomingEvents } from "./eventsService";
import { getBanners } from "./siteBannerService";

function toIsoStringOrNull(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeEvent(event) {
  return {
    _id: event?._id?.toString?.() ?? "",
    event_name: event?.event_name ?? "",
    event_start_date: toIsoStringOrNull(event?.event_start_date),
    event_end_date: toIsoStringOrNull(event?.event_end_date),
    event_details: event?.event_details ?? "",
  };
}

function normalizeBanner(banner) {
  return {
    _id: banner?._id?.toString?.() ?? "",
    banner_message: banner?.banner_message ?? "",
    banner_start_date: toIsoStringOrNull(banner?.banner_start_date),
    banner_end_date: toIsoStringOrNull(banner?.banner_end_date),
    banner_update_date: toIsoStringOrNull(banner?.banner_update_date),
  };
}

export async function fetchHomePageSnapshot(limit = 5) {
  const [eventsResult, bannersResult] = await Promise.allSettled([
    fetchUpcomingEvents(limit),
    getBanners(),
  ]);

  const eventsPayload = eventsResult.status === "fulfilled" ? eventsResult.value : null;
  const banners = bannersResult.status === "fulfilled" ? bannersResult.value : [];

  const bannerMessage = Array.isArray(banners) && banners.length > 0
    ? normalizeBanner(banners[0])
    : normalizeBanner({ banner_message: "" });

  const normalizedEvents = Array.isArray(eventsPayload?.eventsArray)
    ? eventsPayload.eventsArray.map(normalizeEvent)
    : [];

  return {
    events: normalizedEvents,
    message: bannerMessage,
  };
}
