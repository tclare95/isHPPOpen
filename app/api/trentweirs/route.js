import { sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import {
  buildEmptyTrentWeirsPayload,
  getTrentWeirsSnapshot,
} from "../../../libs/services/trentWeirsService";
import { buildOperationalHealth } from "../../../libs/operationalHealth";

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/trentweirs");

  try {
    const data = await getTrentWeirsSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    logger.error("Error in trentweirs", error);
    return sendRouteSuccess({ ...buildEmptyTrentWeirsPayload(), health: buildOperationalHealth({ source: "environment-agency-trent", unavailable: true }) });
  }
}
