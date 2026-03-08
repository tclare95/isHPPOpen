import { mapApiError } from "../../../libs/api/http";
import {
  parseJsonObjectBody,
  sendRouteError,
  sendRouteSuccess,
} from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { createColwickAlertSubscription } from "../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "api/alerts");

  try {
    const payload = await parseJsonObjectBody(request);
    const data = await createColwickAlertSubscription(payload);
    logger.info("Created Colwick alert subscription request", {
      gaugeKey: payload.gaugeKey,
      source: payload.source,
      direction: payload.direction,
    });
    return sendRouteSuccess(data, 201);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in alerts subscribe", error);
    return sendRouteError(statusCode, message);
  }
}