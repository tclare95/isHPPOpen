import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { getLatestLevelsSnapshot } from "../../../libs/services/levelsService";

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/levels");
  try {
    const data = await getLatestLevelsSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in levels", error);
    return sendRouteError(statusCode, message);
  }
}
