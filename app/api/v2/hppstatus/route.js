import { getHppStatusSnapshot } from "../../../../libs/services/hppStatusService";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "app/api/v2/hppstatus");

  try {
    const { data, context } = await getHppStatusSnapshot();

    if (context.isEmpty) {
      logger.warn("No records found in hppstatus");
      return sendRouteSuccess(data);
    }

    if (!context.hasClosureRecord) {
      logger.warn("No closure records found in hppstatus");
      return sendRouteSuccess(data);
    }

    logger.info("HPP status calculated");
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in hppstatus", error);
    return sendRouteError(statusCode, message);
  }
}
