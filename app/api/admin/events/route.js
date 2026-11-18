import { createEvent, listAdminEvents } from "../../../../libs/services/eventsService";
import { mapApiError } from "../../../../libs/api/http";
import { parseJsonObjectBody, requireRouteAdmin, sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../libs/api/logger";
import { revalidateEventCaches } from "../../../../libs/cache/editorialEvents";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Admin browse of past, current and future events: ?scope=upcoming|current|past|all&q=&page=&pageSize=
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/admin/events");
  try {
    await requireRouteAdmin();
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const data = await listAdminEvents(params);
    return sendRouteSuccess(data, 200, NO_STORE);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    if (statusCode >= 500) logger.error("Error listing admin events", error);
    return sendRouteError(statusCode, message, undefined, NO_STORE);
  }
}

// Always creates a new event; never matches an existing one by name.
export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "api/admin/events");
  try {
    const session = await requireRouteAdmin();
    const payload = await parseJsonObjectBody(request);
    const event = await createEvent(payload);
    await revalidateEventCaches(logger, "admin-events-create");
    logger.info("Event created", { actor: session?.user?.id, eventId: event.id });
    return sendRouteSuccess({ message: "Event created", event }, 201);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    if (statusCode >= 500) logger.error("Error creating event", error);
    return sendRouteError(statusCode, message);
  }
}
