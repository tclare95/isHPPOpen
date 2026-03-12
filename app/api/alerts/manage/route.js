import { mapApiError } from "../../../../libs/api/http";
import {
  parseJsonObjectBody,
  sendRouteError,
  sendRouteSuccess,
} from "../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../libs/api/logger";
import {
  deleteManagedColwickAlert,
  listColwickAlertsForManagement,
} from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

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