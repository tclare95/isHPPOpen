import { sendRouteError, sendRouteSuccess } from "../../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../../libs/api/logger";
import { parseEventId } from "../../../../../../libs/history/events";
import { describeHistoryError, getEventComparison } from "../../../../../../libs/history/historyService";
import { historyCacheHeaders } from "../../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Two observed high-water events (Wave C / C1) with each one's own readings window, for
// comparison. ?a=&b= are event ids (UTC instants like 20240102T0315Z). River-level evidence only.
export async function GET(request) {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/events/compare");
  const params = new URL(request.url).searchParams;
  const ids = [params.get("a"), params.get("b")];
  if (ids.some((id) => parseEventId(id) === null)) return sendRouteError(400, "a and b must be UTC instants like 20240102T0315Z");
  if (ids[0] === ids[1]) return sendRouteError(400, "Choose two different events to compare", { reason: "same_event" });
  try {
    const data = await getEventComparison(ids);
    // Unresolved selections and unreadable months are retried soon, as revisions or reads settle.
    const partial = !data.ready || data.monthsFailed.length > 0 || data.events.some((slot) => slot.window?.monthsFailed.length);
    return sendRouteSuccess(data, 200, historyCacheHeaders(data.inProgress, partial));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History event comparison failed ${JSON.stringify({ code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
