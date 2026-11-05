import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../libs/api/logger";
import { describeHistoryError, getMonthHistory } from "../../../../../libs/history/historyService";
import { historyCacheHeaders, parseHistoryPeriod } from "../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Observed Colwick readings and evidence-aware summary for one UK calendar month.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/month");
  const period = parseHistoryPeriod(new URL(request.url).searchParams, { requireMonth: true });
  if (period.error) return sendRouteError(400, period.error);
  try {
    const data = await getMonthHistory(period.year, period.month);
    return sendRouteSuccess(data, 200, historyCacheHeaders(data.period.inProgress));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History month read failed ${JSON.stringify({ year: period.year, month: period.month, code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
