import { getBanners, upsertBanner } from "../../../libs/services/siteBannerService";
import { mapApiError } from "../../../libs/api/http";
import {
  parseJsonObjectBody,
  requireRouteSession,
  sendRouteError,
  sendRouteSuccess,
} from "../../../libs/api/httpApp";
import { createRequestLogger } from "../../../libs/api/logger";
import { revalidateTagsSafe } from "../../../libs/cache/revalidate";
import { CACHE_TAGS } from "../../../libs/cache/tags";

export const dynamic = "force-dynamic";

export async function GET() {
  const logger = createRequestLogger({ method: "GET" }, "api/sitebanner");
  try {
    const data = await getBanners();
    return sendRouteSuccess(data);
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in sitebanner", error);
    return sendRouteError(statusCode, message);
  }
}

export async function POST(request) {
  const logger = createRequestLogger({ method: "POST" }, "api/sitebanner");
  try {
    await requireRouteSession();
    const payload = await parseJsonObjectBody(request);
    const result = await upsertBanner(payload);
    await revalidateTagsSafe([CACHE_TAGS.SITE_BANNER, CACHE_TAGS.HOME_SNAPSHOT], {
      logger,
      context: "sitebanner-post",
    });
    return sendRouteSuccess({
      message: "Banner updated",
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    });
  } catch (error) {
    const { statusCode, message } = mapApiError(error);
    logger.error("Error in sitebanner", error);
    return sendRouteError(statusCode, message);
  }
}
