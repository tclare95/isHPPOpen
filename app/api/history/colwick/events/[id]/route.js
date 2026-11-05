import { sendRouteError, sendRouteSuccess } from "../../../../../../libs/api/httpApp";
import { createRequestLogger } from "../../../../../../libs/api/logger";
import { parseEventId } from "../../../../../../libs/history/events";
import { describeHistoryError, getEventDetail } from "../../../../../../libs/history/historyService";
import { historyCacheHeaders } from "../../../../../../libs/history/period";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One observed high-water event (#105) with the readings around it. The id is the UTC
// instant of the event's first observed reading at or above 2.2 m, e.g. 20240102T0315Z.
export async function GET(_request, context) {
  const logger = createRequestLogger({ method: "GET" }, "api/history/colwick/events/[id]");
  const { id } = (await context?.params) ?? {};
  if (parseEventId(id) === null) return sendRouteError(400, "id must be a UTC instant like 20240102T0315Z");
  try {
    const data = await getEventDetail(id);
    const partial = data.monthsFailed.length > 0 || Boolean(data.window?.monthsFailed.length);
    if (!data.found) {
      return sendRouteError(404, "No high-water event matches this link in the current history. Provider revisions can move or remove events.",
        { reason: "not_found" }, historyCacheHeaders(true, true));
    }
    return sendRouteSuccess(data, 200, historyCacheHeaders(data.inProgress, partial));
  } catch (error) {
    const failure = describeHistoryError(error);
    logger.warn(`History event read failed ${JSON.stringify({ id, code: failure.code })}`);
    return sendRouteError(failure.status, failure.message, { reason: failure.reason, code: failure.code });
  }
}
