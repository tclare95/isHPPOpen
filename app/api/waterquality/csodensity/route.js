import { mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getWaterQualityDensitySeries } from "../../../../libs/services/waterQualityService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const hoursParam = request?.nextUrl?.searchParams?.get("hours");
    const parsedHours = Number(hoursParam);
    const hours = Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 120;

    const endTime = new Date();
    const result = await getWaterQualityDensitySeries(hours, endTime);
    return sendRouteSuccess(result);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
