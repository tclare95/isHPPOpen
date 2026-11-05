import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { describeHistoryError, getEventsIndex } from "../../../../../libs/history/historyService";
import { historyCacheHeaders } from "../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Observed Colwick high-water events (#105) identified from all available history.
// River-level evidence only: never HPP operational closures.
export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/events");
  try {
    const data = await getEventsIndex();
    const partial = data.monthsFailed.length > 0;
    if (partial) logger.warn(`History events partial ${JSON.stringify({ monthsFailed: data.monthsFailed.length })}`);
    // Always includes the current month, so it follows the in-progress cadence.
    return sendRouteSuccess(data, 200, historyCacheHeaders(true, partial));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History events failed ${JSON.stringify({ code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
