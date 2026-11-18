import { deleteEventById, updateEventById } from "../../../../../libs/services/eventsService";
import { mapApiError } from "../../../../../libs/api/http";
import { parseJsonObjectBody, requireRouteAdmin, sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { revalidateEventCaches } from "../../../../../libs/cache/editorialEvents";

export const dynamic = "force-dynamic";

async function routeId(context) {
  const params = await context?.params;
  return params?.id;
}

// Updates exactly the event with this id: invalid id 400, unknown id 404, never an insert.
export async function PUT(request, context) {
  const logger = createRequestLogger({ method: "PUT" }, "api/admin/events/[id]");
  try {
    const session = await requireRouteAdmin();
    const id = await routeId(context);
    const payload = await parseJsonObjectBody(request);
    const { event, changed } = await updateEventById(id, payload);
    if (changed) await revalidateEventCaches(logger, "admin-events-update");
    logger.info("Event updated", { actor: session?.user?.id, eventId: event.id, changed });
    return sendRouteSuccess({ message: changed ? "Event updated" : "No changes to save", event, changed });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    if (statusCode >= 500) logger.error("Error updating event", error);
    return sendRouteError(statusCode, message);
  }
}

export async function DELETE(_request, context) {
  const logger = createRequestLogger({ method: "DELETE" }, "api/admin/events/[id]");
  try {
    const session = await requireRouteAdmin();
    const { id } = await deleteEventById(await routeId(context));
    await revalidateEventCaches(logger, "admin-events-delete");
    logger.info("Event deleted", { actor: session?.user?.id, eventId: id });
    return sendRouteSuccess({ message: "Event deleted", deleted: true, id });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    if (statusCode >= 500) logger.error("Error deleting event", error);
    return sendRouteError(statusCode, message);
  }
}
