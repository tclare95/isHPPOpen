import { HttpError, mapApiError } from "../../../../libs/api/http";
import { sendRouteError, sendRouteSuccess } from "../../../../libs/api/httpApp";
import { RdpError } from "../../../../libs/rdp/errors";
import { createRequestLogger } from "../../../../libs/api/logger";
import { getHppRiverContext, hppRiverFixturesEnabled, validateHppRiverQuery } from "../../../../libs/services/hppRiverService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  try {
    const fixtures = hppRiverFixturesEnabled();
    if (!fixtures && !["preview", "production"].includes(process.env.VERCEL_ENV)) {
      throw new HttpError(404, "River context is not enabled");
    }
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some((key) => !["direction", "geometry"].includes(key) || query.getAll(key).length !== 1)) {
      throw new HttpError(400, "Choose upstream or downstream and an optional geometry mode");
    }
    const direction = query.get("direction") ?? "upstream";
    const geometry = query.get("geometry") ?? "reaches";
    validateHppRiverQuery(direction, geometry);
    const data = await getHppRiverContext(direction, geometry, { fixtures });
    return sendRouteSuccess(data, 200, fixtures ? headers : {
      "Cache-Control": data.status === "available" ? "public, s-maxage=86400, stale-while-revalidate=3600" : "public, s-maxage=60",
    });
  } catch (error) {
    if (error instanceof RdpError) {
      if (error.code !== "INVALID_QUERY") createRequestLogger(request, "api/waterquality/river")
        .warn("River context read failed", { code: error.code });
      return sendRouteError(error.code === "INVALID_QUERY" ? 400 : 503,
        error.code === "INVALID_QUERY" ? "Choose upstream or downstream and geometry=reaches or none" : "River context is temporarily unavailable",
        undefined, headers);
    }
    const { statusCode, message } = mapApiError(error);
    return sendRouteError(statusCode, message, undefined, headers);
  }
}
