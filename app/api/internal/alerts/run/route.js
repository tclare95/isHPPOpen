import { HttpError, mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { runColwickAlerts } from "../../../../../libs/services/colwickAlertsService";

export const dynamic = "force-dynamic";

function getHeaderValue(headers, name) {
  if (!headers) {
    return null;
  }

  if (typeof headers.get === "function") {
    return headers.get(name);
  }

  const matchingKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchingKey ? headers[matchingKey] : null;
}

function assertCronAuthorized(request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    throw new HttpError(500, "Cron secret not configured");
  }

  const authorization = getHeaderValue(request?.headers, "authorization");

  if (authorization !== `Bearer ${configuredSecret}`) {
    throw new HttpError(401, "Unauthorized");
  }
}

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