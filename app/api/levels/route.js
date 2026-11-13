import { sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { buildGovernmentForecastHealth, getLatestLevelsSnapshot } from "../../../libs/services/levelsService";
import { buildOperationalHealth } from "../../../libs/operationalHealth";

function emptyLevelsPayload() {
  return {
    level_data: [],
    forecast_data: [],
    health: { ...buildOperationalHealth({ source: "levels", unavailable: true }), forecast: buildGovernmentForecastHealth() },
  };
}

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/levels");
  try {
    const data = await getLatestLevelsSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    logger.error("Error in levels", error);
    return sendRouteSuccess(emptyLevelsPayload());
  }
}
