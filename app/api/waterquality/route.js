import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { getPublicWaterQualitySnapshot } from "../../../libs/services/waterQualityService";

export const revalidate = 900;

export async function GET() {
  try {
    const waterQualityData = await getPublicWaterQualitySnapshot();
    return sendRouteSuccess({ waterQualityData });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
