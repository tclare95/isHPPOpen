import { mapApiError } from "../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../libs/api/httpApp";
import { getLatestForecastSnapshot } from "../../../libs/services/forecastService";

export const revalidate = 900;

export async function GET() {
  try {
    const data = await getLatestForecastSnapshot();
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
