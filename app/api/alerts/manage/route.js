import { HttpError, mapApiError } from "../../../../libs/api/http";
import {
  parseJsonObjectBody,
  sendRouteError,
  sendRouteSuccess,
} from "../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../libs/api/logger";
import {
  deleteManagedColwickAlert,
  editManagedColwickAlert,
  listColwickAlertsForManagement,
  pauseManagedColwickAlert,
  resumeManagedColwickAlert,
} from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

const CHANGE_ACTIONS = {
  edit: (payload) => editManagedColwickAlert({ token: payload.token, alertKey: payload.alertKey, changes: payload.changes }),
  pause: (payload) => pauseManagedColwickAlert({ token: payload.token, alertKey: payload.alertKey }),
  resume: (payload) => resumeManagedColwickAlert({ token: payload.token, alertKey: payload.alertKey }),
};

export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/alerts/manage");

  try {
    const token = request.nextUrl.searchParams.get("token");
    const data = await listColwickAlertsForManagement(token);
    logger.info("Loaded Colwick alert management view");
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts manage GET", error);
    return sendRouteError(statusCode, message);
  }
}

// Subscriber edit, pause and resume, authorized by the same management token as GET and DELETE.
export async function PATCH(request) {
  const logger = createRequestLogger({ method: "PATCH" }, "api/alerts/manage");

  try {
    const payload = await parseJsonObjectBody(request);
    const change = Object.hasOwn(CHANGE_ACTIONS, payload.action) ? CHANGE_ACTIONS[payload.action] : null;
    if (!change) throw new HttpError(400, "Unknown alert action");
    const data = await change(payload);
    logger.info("Changed managed alert", { action: payload.action });
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts manage PATCH", error);
    return sendRouteError(statusCode, message);
  }
}

export async function DELETE(request) {
  const logger = createRequestLogger({ method: "DELETE" }, "api/alerts/manage");

  try {
    const payload = await parseJsonObjectBody(request);
    const data = await deleteManagedColwickAlert({
      token: payload.token,
      alertKey: payload.alertKey,
    });
    logger.info("Removed managed Colwick alert");
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts manage DELETE", error);
    return sendRouteError(statusCode, message);
  }
}
