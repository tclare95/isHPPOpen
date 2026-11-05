import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { describeHistoryError, getYearHistory } from "../../../../../libs/history/historyService";
import { historyCacheHeaders, parseHistoryPeriod } from "../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily Colwick summaries for one UK calendar year, composed from cached months.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/year");
  const period = parseHistoryPeriod(new URL(request.url).searchParams);
  if (period.error) return sendRouteError(400, period.error);
  try {
    const data = await getYearHistory(period.year);
    const partial = data.months.some((month) => month.status !== "available");
    return sendRouteSuccess(data, 200, historyCacheHeaders(data.period.inProgress, partial));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History year read failed ${JSON.stringify({ year: period.year, code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
