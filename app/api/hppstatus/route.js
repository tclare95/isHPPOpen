import { buildEmptyStatusPayload, getHppStatusSnapshot } from "../../../libs/services/hppStatusService";
import { sendRouteSuccess } from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { buildOperationalHealth } from "../../../libs/operationalHealth";

export const revalidate = 900;

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/hppstatus");
  try {
    const { data } = await getHppStatusSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    logger.error("Error in hppstatus", error);
    return sendRouteSuccess({ ...buildEmptyStatusPayload(), health: buildOperationalHealth({ source: "mongodb-hpp-status", unavailable: true }) });
  }
}
