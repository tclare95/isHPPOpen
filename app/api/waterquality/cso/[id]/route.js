import { mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { getCsoDetailsById } from "../../../../../libs/services/waterQualityService";

export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  try {
    const params = await context?.params;
    const csoData = await getCsoDetailsById(params?.id);
    return sendRouteSuccess(csoData);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
