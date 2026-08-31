import { HttpError, mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getWaterQualityDensitySeries } from "../../../../libs/services/waterQualityService";

export const revalidate = 900;

export async function GET(request) {
  try {
    const hoursParam = request?.nextUrl?.searchParams?.get("hours");
    const intervalParam = request?.nextUrl?.searchParams?.get("interval");
    const hours = hoursParam === null ? 120 : Number(hoursParam);
    const interval = intervalParam === null ? 15 : Number(intervalParam);
    if (!Number.isFinite(hours) || hours < 1 || hours > 8760) {
      throw new HttpError(400, "hours must be between 1 and 8760");
    }
    if (![15, 60].includes(interval)) {
      throw new HttpError(400, "interval must be 15 or 60 minutes");
    }

    const endTime = new Date();
    const result = await getWaterQualityDensitySeries(hours, endTime, interval);
    return sendRouteSuccess(result);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
