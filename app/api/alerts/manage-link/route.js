import { mapApiError } from "../../../../libs/api/http";
import {
  parseJsonObjectBody,
  sendRouteError,
  sendRouteSuccess,
} from "../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../libs/api/logger";
import { requestColwickAlertManagementLink } from "../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "api/alerts/manage-link");

  try {
    const payload = await parseJsonObjectBody(request);
    const ip = request.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() || request.headers?.get?.("x-real-ip") || "unknown";
    const data = ip === "unknown" ? await requestColwickAlertManagementLink(payload.email) : await requestColwickAlertManagementLink(payload.email, { ip });
    logger.info("Sent alert management link request");
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts manage-link", error);
    return sendRouteError(statusCode, message);
  }
}
