import { mapApiError } from "../../../libs/api/http";
import { parseJsonObjectBody, sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { recordTrentLockSubmission } from "../../../libs/services/trentLockService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const parsedRequest = await parseJsonObjectBody(request);
    const result = await recordTrentLockSubmission(parsedRequest);
    return sendRouteSuccess(result);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
