import { getBanners, upsertBanner } from "../../../../libs/services/siteBannerService";
import {
  parseJsonObjectBody,
  requireRouteSession,
  sendRouteError,
  sendRouteSuccess,
} from "../../../../libs/api/httpApp";
import { mapApiError } from "../../../../libs/api/http";
import { createRequestLogger } from "../../../../libs/api/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "app/api/v2/sitebanner");

  try {
    const data = await getBanners();
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in sitebanner GET", error);
    return sendRouteError(statusCode, message);
  }
}

export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "app/api/v2/sitebanner");

  try {
    await requireRouteSession();
    const payload = await parseJsonObjectBody(request);
    const result = await upsertBanner(payload);

    return sendRouteSuccess({
      message: "Banner updated",
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in sitebanner POST", error);
    return sendRouteError(statusCode, message);
  }
}
