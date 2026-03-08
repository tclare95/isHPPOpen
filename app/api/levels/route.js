import { sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { getLatestLevelsSnapshot } from "../../../libs/services/levelsService";

const EMPTY_LEVELS_PAYLOAD = {
  level_data: [],
  forecast_data: [],
};

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/levels");
  try {
    const data = await getLatestLevelsSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    logger.error("Error in levels", error);
    return sendRouteSuccess(EMPTY_LEVELS_PAYLOAD);
  }
}
