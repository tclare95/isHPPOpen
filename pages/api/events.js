import { authOptions } from "./auth/[...nextauth]";
import {
  fetchUpcomingEvents,
  upsertEvent,
  deleteEventById,
} from "../../libs/services/eventsService";
import {
  getMethodHandler,
  HttpError,
  mapApiError,
  parseJsonObjectBody,
  requireSession,
  sendApiError,
  sendApiSuccess,
} from "../../libs/api/http";
import { createRequestLogger } from "../../libs/api/logger";

export default async function handler(req, res) {
  const logger = createRequestLogger(req, "events");

  const handlers = {
    GET: async () => {
      const parsedLimit = req.query?.limit ? Number(req.query.limit) : 5;
      const limit = Number.isInteger(parsedLimit) ? parsedLimit : 5;
      const data = await fetchUpcomingEvents(limit);
      logger.info("GET events called", { limit });
      sendApiSuccess(res, data);
    },
    POST: async () => {
      const parsedRequest = parseJsonObjectBody(req.body);
      const session = await requireSession(req, res, authOptions);
      const result = await upsertEvent(parsedRequest);

      if (result.modifiedCount === 1 || result.upsertedCount === 1) {
        logger.info("Event modified", {
          actor: session.user.email,
          eventId: parsedRequest.new_event_id,
        });
        sendApiSuccess(res, {
          message: "Update successful",
          id: parsedRequest.new_event_id,
        });
        return;
      }

      logger.error("Update unsuccessful", { eventId: parsedRequest.new_event_id });
      throw new HttpError(500, "Update failed");
    },
    DELETE: async () => {
      const { id } = req.query;
      if (!id) {
        throw new HttpError(400, "Missing id parameter");
      }

      const session = await requireSession(req, res, authOptions);
      const result = await deleteEventById(id);

      if (result.deletedCount === 1) {
        sendApiSuccess(res, { deleted: true, id });
        logger.info("Event deleted", { actor: session.user.email, eventId: id });
        return;
      }

      logger.warn("Event not found for deletion", { eventId: id });
      throw new HttpError(404, "Event Not Found");
    },
  };

  try {
    const methodHandler = getMethodHandler(req, res, handlers);
    if (!methodHandler) {
      return;
    }

    await methodHandler();
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in events", error);
    sendApiError(res, statusCode, message);
  }
}
