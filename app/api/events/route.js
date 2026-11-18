import { fetchUpcomingEvents } from "../../../libs/services/eventsService";
import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";

export const dynamic = "force-dynamic";

// Public upcoming-events feed. Admin browsing and writes live under /api/admin/events.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/events");
  try {
    const limitParam = request.nextUrl.searchParams.get("limit");
    const parsedLimit = limitParam ? Number(limitParam) : 5;
    const limit = Number.isInteger(parsedLimit) ? parsedLimit : 5;
    const data = await fetchUpcomingEvents(limit);
    logger.info("GET events called", { limit });
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in events", error);
    return sendRouteError(statusCode, message);
  }
}
