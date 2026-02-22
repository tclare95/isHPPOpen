import {
  fetchUpcomingEvents,
  upsertEvent,
  deleteEventById,
} from "../../../libs/services/eventsService";
import { HttpError, mapApiError } from "../../../libs/api/http";
import {
  parseJsonObjectBody,
  requireRouteSession,
  sendRouteError,
  sendRouteSuccess,
} from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "api/events");
  try {
    const payload = await parseJsonObjectBody(request);
    const session = await requireRouteSession();
    const result = await upsertEvent(payload);

    if (result.modifiedCount === 1 || result.upsertedCount === 1) {
      logger.info("Event modified", { actor: session?.user?.email, eventId: payload.new_event_id });
      return sendRouteSuccess({ message: "Update successful", id: payload.new_event_id });
    }

    throw new HttpError(500, "Update failed");
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in events", error);
    return sendRouteError(statusCode, message);
  }
}

export async function DELETE(request) {
  const logger = createRequestLogger({ method: "DELETE" }, "api/events");
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new HttpError(400, "Missing id parameter");

    const session = await requireRouteSession();
    const result = await deleteEventById(id);

    if (result.deletedCount === 1) {
      logger.info("Event deleted", { actor: session?.user?.email, eventId: id });
      return sendRouteSuccess({ deleted: true, id });
    }

    throw new HttpError(404, "Event Not Found");
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in events", error);
    return sendRouteError(statusCode, message);
  }
}
