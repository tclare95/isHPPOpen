import { mapApiError } from "../../../../../libs/api/http";
import { assertCronAuthorized } from "../../../../../libs/api/cronAuth";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { runColwickAlerts } from "../../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";
// Water-quality rules under RDP_WQ_ASSESSMENT=rdp may need a cold 7-day RDP set read (about 70 s, normally cached).
export const maxDuration = 180;

export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/internal/alerts/run");

  try {
    assertCronAuthorized(request);
    const data = await runColwickAlerts();
    logger.info("Ran Colwick alert evaluation", data);
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts run", error);
    return sendRouteError(statusCode, message);
  }
}
