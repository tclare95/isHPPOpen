import { mapApiError } from "../../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../../libs/api/httpApp";
import { getPublicCsoEventDetail } from "../../../../../../libs/services/waterQualityService";

// One recorded event with its revision history (#121). Read only when a visitor opens an event.
export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  try {
    const params = await context?.params;
    const detail = await getPublicCsoEventDetail(params?.eventId);
    return sendRouteSuccess(detail, 200, { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, { "Cache-Control": statusCode === 404 ? "public, s-maxage=60" : "no-store" });
  }
}
