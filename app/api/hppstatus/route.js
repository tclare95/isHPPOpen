import { getHppStatusSnapshot } from "../../../libs/services/hppStatusService";
import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/hppstatus");
  try {
    const { data } = await getHppStatusSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in hppstatus", error);
    return sendRouteError(statusCode, message);
  }
}
