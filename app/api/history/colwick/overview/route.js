import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { describeHistoryError, getHistoryOverview } from "../../../../../libs/history/historyService";
import { historyCacheHeaders } from "../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Year-on-year and seasonal Colwick context across all available history.
export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/overview");
  try {
    const data = await getHistoryOverview();
    if (data.monthsFailed) logger.warn(`History overview partial ${JSON.stringify({ monthsFailed: data.monthsFailed })}`);
    return sendRouteSuccess(data, 200, historyCacheHeaders(true, data.monthsFailed > 0));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History overview failed ${JSON.stringify({ code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
