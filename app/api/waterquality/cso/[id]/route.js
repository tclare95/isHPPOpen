import { mapApiError } from "../../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../../libs/api/httpApp";
import { getPublicCsoDetailsById } from "../../../../../libs/services/waterQualityService";

export const revalidate = 900;

export const dynamic = "force-dynamic";

export async function GET(_request, context) {
  try {
    const params = await context?.params;
    const csoData = await getPublicCsoDetailsById(params?.id);
    return sendRouteSuccess(csoData);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
