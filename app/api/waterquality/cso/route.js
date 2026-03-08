import { HttpError, mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { getCsoDetailsByIds } from "../../../../libs/services/waterQualityService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const ids = request.nextUrl.searchParams.get("ids");
    if (!ids) throw new HttpError(400, "Missing ids query parameter");

    const idArray = ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idArray.length === 0) throw new HttpError(400, "No valid ids provided");

    const response = await getCsoDetailsByIds(idArray);
    return sendRouteSuccess({ csoData: response });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message);
  }
}
